class_name CapacityTest
extends Node
## How many books the library holds. Run by tools/godot-capacity.mjs in headless Edge:
##   ?capacity        add every PDF the driver lists (window.__capacityFiles) through the real import sheet, one by
##                    one, measuring each: time, files kept, Godot and browser memory, and every 20 books how long
##                    Home and Practice take to build — results in window.__capacity.rows
##   ?capacity=verify after a reload: start-up time, every book still there and opening, Practice, then delete all

var verify := false
var _rows: Array = []


func _ready() -> void:
	verify = str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('capacity') || ''", true)) == "verify"
	Engine.max_fps = 15 # the test drives the library, not the screen: fewer frames for a software-drawn headless browser
	await get_tree().create_timer(0.5).timeout
	JavaScriptBridge.eval("window.__capacity = { rows: [], done: false }")
	if verify:
		await _verify()
	else:
		await _fill()
	JavaScriptBridge.eval("window.__capacity.done = true")


func _js(expr: String) -> Variant:
	return JavaScriptBridge.eval(expr, true)


func _push(row: Dictionary) -> void:
	_rows.append(row)
	JavaScriptBridge.eval("window.__capacity.rows.push(%s)" % JSON.stringify(row))


func _stats() -> Dictionary:
	var files := 0
	var bytes := 0
	var d := DirAccess.open(Library.DIR)
	if d:
		for f in d.get_files():
			var fa := FileAccess.open(Library.DIR + f, FileAccess.READ)
			if fa:
				files += 1
				bytes += fa.get_length()
	var save := FileAccess.open(App.SAVE_PATH, FileAccess.READ)
	return {"books": Library.books().size(), "files": files, "bytes": bytes, "save_bytes": save.get_length() if save else 0,
		"godot_mb": snappedf(OS.get_static_memory_usage() / 1048576.0, 0.1),
		"js_mb": snappedf(float(_js("performance.memory ? performance.memory.usedJSHeapSize : 0")) / 1048576.0, 0.1)}


func _timed(cb: Callable) -> int:
	var t := Time.get_ticks_usec()
	cb.call()
	return int((Time.get_ticks_usec() - t) / 1000)


## Home with every book, and Practice reading every book's questions
func _ui_costs(row: Dictionary) -> void:
	var home: Control = App.main.stack[0]
	row.home_ms = _timed(func(): home.render())
	Library._practice_key = "-"
	row.practice_ms = _timed(func(): Library.practice_chapters())
	row.practice_chapters = Library.practice_chapters().size()
	JavaScriptBridge.eval("window.__est = null; navigator.storage && navigator.storage.estimate().then((e) => (window.__est = e))")
	for i in 60:
		if str(_js("window.__est ? 1 : ''")) == "1":
			break
		await get_tree().process_frame
	row.storage_mb = snappedf(float(_js("window.__est ? window.__est.usage : 0")) / 1048576.0, 0.1)
	row.quota_mb = int(float(_js("window.__est ? window.__est.quota : 0")) / 1048576.0)


func _fill() -> void:
	var files: Variant = null
	for i in 600:
		files = JSON.parse_string(str(_js("JSON.stringify(window.__capacityFiles || null)")))
		if files is Array:
			break
		await get_tree().process_frame
	if not files is Array:
		_push({"error": "no files listed"})
		return
	var fails := 0
	for i in files.size():
		if str(_js("window.__capacityStop ? 1 : ''")) == "1":
			_push({"stopped": "the driver asked to stop (low memory)", "at": i})
			break
		var t0 := Time.get_ticks_msec()
		var flow := ImportFlow.start_url(str(files[i][0]), str(files[i][1]))
		while is_instance_valid(flow) and flow.state in ["intro", "picking", "running", "asking"] and Time.get_ticks_msec() - t0 < 240000:
			await get_tree().process_frame
		var ok := is_instance_valid(flow) and flow.state == "done"
		var row := {"n": i + 1, "name": str(files[i][1]), "ok": ok, "ms": Time.get_ticks_msec() - t0,
			"install_ms": flow.install_ms if is_instance_valid(flow) else -1, "error": flow.error if is_instance_valid(flow) and not ok else ""}
		if ok:
			var e: Dictionary = flow.result.entry
			row.chapters = e.chapters.size()
			row.notes = int(e.notes)
			row.mcq = int(e.mcq)
		row.merge(_stats())
		if (i + 1) % 20 == 0 or i == files.size() - 1:
			await _ui_costs(row)
		App.main.close_sheet()
		await get_tree().process_frame
		_push(row)
		fails = 0 if ok else fails + 1
		if fails >= 3:
			_push({"stopped": "3 imports failed in a row", "at": i + 1})
			break


func _verify() -> void:
	var row := {"phase": "after reload", "boot_ms": int(float(_js("performance.now()")))}
	row.merge(_stats())
	# every book opens (a sample spread over the library), the newest first
	var list := Library.books()
	var opened := 0
	var worst := 0
	var picks: Array = []
	for k in mini(8, list.size()):
		picks.append(list[int(k * (list.size() - 1) / maxf(1, mini(8, list.size()) - 1))])
	for e in picks:
		App.forget_pack(str(e.id))
		var t := Time.get_ticks_msec()
		var p := await App.load_pack(str(e.id))
		worst = maxi(worst, Time.get_ticks_msec() - t)
		if not p.is_empty() and p.chapters.size() == e.chapters.size():
			opened += 1
	row.sample_opened = "%d/%d" % [opened, picks.size()]
	row.open_worst_ms = worst
	var missing := 0
	for e in list:
		if not FileAccess.file_exists(Library.pack_path(str(e.id))) or not FileAccess.file_exists(Library.mcq_path(str(e.id))):
			missing += 1
	row.books_missing_files = missing
	await _ui_costs(row)
	var q: Array = [{}] # (a lambda changes what it is handed, not a local it sees)
	row.round_ms = _timed(func(): q[0] = PracticeBank.make([], 4, {}))
	row.round_ok = not q[0].is_empty()
	_push(row)
	# delete them all
	var t2 := Time.get_ticks_msec()
	for e in list.duplicate():
		Library.remove(str(e.id))
	var gone := {"phase": "after deleting all", "delete_ms": Time.get_ticks_msec() - t2}
	gone.merge(_stats())
	await _ui_costs(gone)
	_push(gone)

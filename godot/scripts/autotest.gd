class_name AutoTest
extends Node
## A new student, automated: taps through every screen with real input events (they go through Godot's
## GUI hit-testing, so a covered or dead button fails), checks each tap did its job, and reports.
## Desktop: godot --headless --path godot -- --autotest   (exit code = failures)
## Web: index.html?autotest — results in window.__holo; the CDP driver screenshots at each window.__shot.

var results: Array = []
var _web := OS.has_feature("web")
var _clicks := 0


func _ready() -> void:
	if DisplayServer.get_name() == "headless": # the headless window is 64×64 — test at a phone's size
		get_window().size = Vector2i(412, 860)
		get_window().content_scale_size = Vector2i.ZERO
		App.main._on_resize()
	await get_tree().create_timer(0.6).timeout
	await _run()
	var fails := results.filter(func(r): return not r.ok).size()
	var summary := "%d passed · %d failed" % [results.size() - fails, fails]
	print("AUTOTEST ", summary)
	if _web:
		JavaScriptBridge.eval("window.__holo = Object.assign(window.__holo || {}, { done: true, summary: %s })" % JSON.stringify(summary))
	else:
		get_tree().quit(fails)


func _step(name: String, ok: bool, detail := "") -> void:
	results.append({"name": name, "ok": ok, "detail": detail})
	print("%s  %s%s" % ["PASS" if ok else "FAIL", name, (" — " + detail) if detail != "" else ""])
	if _web:
		JavaScriptBridge.eval("(window.__holo = window.__holo || { steps: [] }).steps = (window.__holo.steps || []).concat([%s])" % JSON.stringify({"name": name, "ok": ok, "detail": detail}))


## let the CDP driver take a screenshot (waits up to 4 s for it; no driver = no wait)
func _shot(name: String) -> void:
	await _frames(4)
	if not _web:
		return
	JavaScriptBridge.eval("window.__shot = %s" % JSON.stringify(name))
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < 4000:
		if str(JavaScriptBridge.eval("window.__shotDone || ''", true)) == name:
			return
		await get_tree().process_frame


func _frames(n := 2) -> void:
	for i in n:
		await get_tree().process_frame


func _wait(cond: Callable, seconds := 8.0) -> bool:
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < seconds * 1000:
		if cond.call():
			return true
		await get_tree().process_frame
	return false


func _top() -> Control:
	return App.main.stack.back()


func _find(name: String) -> Control:
	var n: Node = null
	if App.main.has_sheet():
		n = App.main.overlay.find_child(name, true, false)
	if n == null:
		n = _top().find_child(name, true, false)
	return n as Control


## a real tap: scroll it into view, check nothing covers it, press + release at its centre
func _tap(name_or_node: Variant, label := "") -> bool:
	var c: Control = _find(name_or_node) if name_or_node is String else name_or_node
	var what: String = label if label != "" else str(name_or_node if name_or_node is String else c.name)
	if c == null:
		_step("tap " + what, false, "not found")
		return false
	var p := c.get_parent()
	while p:
		if p is ScrollContainer:
			(p as ScrollContainer).ensure_control_visible(c)
			break
		p = p.get_parent()
	await _frames(3)
	if not c.is_visible_in_tree():
		_step("tap " + what, false, "not visible")
		return false
	var center := c.get_global_rect().get_center()
	var hit: Control = null
	var xf: Transform2D = App.main.get_viewport().get_final_transform()
	var pos: Vector2 = xf * center
	var mv := InputEventMouseMotion.new()
	mv.position = pos
	mv.global_position = pos
	App.main.get_viewport().push_input(mv)
	await _frames(2)
	hit = App.main.get_viewport().gui_get_hovered_control()
	if hit != null and hit != c and not c.is_ancestor_of(hit) and not hit.is_ancestor_of(c):
		_step("tap " + what, false, "covered by " + str(hit.get_path()).get_file())
		return false
	for pressed in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = pressed
		e.position = pos
		e.global_position = pos
		e.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
		App.main.get_viewport().push_input(e)
		await _frames(2)
	await _frames(3)
	return true


func _back() -> void:
	App.main.back()
	await _frames(6)


## a tap the browser itself sees (the CDP driver clicks with the mouse): file pickers only open after one.
## Without the driver (desktop), the usual tap.
func _real_tap(name: String, label := "") -> bool:
	if not _web:
		return await _tap(name, label)
	var c := _find(name)
	if c == null:
		_step("tap " + (label if label != "" else name), false, "not found")
		return false
	var p := c.get_parent()
	while p:
		if p is ScrollContainer:
			(p as ScrollContainer).ensure_control_visible(c)
			break
		p = p.get_parent()
	await _frames(4)
	var px: Vector2 = App.main.get_viewport().get_final_transform() * c.get_global_rect().get_center()
	var dpr := float(JavaScriptBridge.eval("window.devicePixelRatio || 1", true))
	_clicks += 1
	JavaScriptBridge.eval("window.__click = {x: %f, y: %f, n: %d}" % [px.x / dpr, px.y / dpr, _clicks])
	var ok := await _wait(func(): return int(JavaScriptBridge.eval("window.__clickDone || 0", true)) == _clicks, 5)
	await _frames(4)
	return ok


# ───────── the walk-through ─────────

func _run() -> void:
	# 1 · home
	var ok := await _wait(func(): return _find("Subject_physics") != null, 10)
	_step("home shows the subjects", ok)
	await _shot("home")
	# 2 · a subject → a chapter → Listen
	await _tap("Subject_physics", "Physics")
	ok = await _wait(func(): return _top().name == "Subject" and _find("Chapter1") != null)
	_step("Physics opens its chapters", ok)
	await _shot("subject")
	await _tap("Class12", "Class 12 switch")
	ok = await _wait(func(): return _top().title_l.text == "Physics" and _top().sub_l.text.begins_with("Class 12"))
	_step("Class 12 switch", ok, _top().sub_l.text)
	await _tap("Class11", "Class 11 switch")
	await _tap("Chapter1", "chapter 1")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Act_listen") != null)
	_step("a chapter opens its sheet", ok)
	await _shot("chapter-sheet")
	await _tap("Act_listen", "Listen")
	ok = await _wait(func(): return _top().name == "Lesson" and not _top().pack.is_empty() and _find("Pane_listen") != null, 20)
	_step("Listen opens the chapter", ok)
	var lesson = _top()
	await _frames(10)
	await _shot("listen")
	# 3 · listen
	await _tap("Play", "▶ play")
	if not lesson is LessonScreen:
		_step("the lesson is open", false)
		return
	ok = await _wait(func(): return lesson.player.playing)
	_step("▶ starts reading", ok)
	ok = await _wait(func(): return "[bgcolor" in (_find("NowText") as RichTextLabel).text, 4)
	_step("the spoken word is highlighted", ok)
	await _shot("listen-playing")
	ok = await _wait(func(): return lesson.player.idx >= 1, 15)
	_step("auto-advance moves to the next note", ok, "note %d" % lesson.player.idx)
	await _tap("Play", "❚❚ pause")
	ok = await _wait(func(): return lesson.player.paused or not lesson.player.playing)
	_step("❚❚ pauses", ok)
	lesson.player.stop()
	var before: int = lesson.player.idx
	await _tap("Next", "⏭ next note")
	_step("⏭ next note", lesson.player.idx == before + 1, "%d → %d" % [before, lesson.player.idx])
	await _tap("MarkHeard", "✓ mark heard")
	_step("mark heard counts", lesson.player.is_heard(lesson.player.idx))
	var toggle := _find("Toggle")
	var sec_count := 0
	for s in _find("Notes").get_children():
		if str(s.name).begins_with("Sec_"):
			sec_count += 1
	_step("notes are grouped by section", sec_count > 3, "%d sections" % sec_count)
	# open a closed section
	var closed: Control = null
	for s in _find("Notes").get_children():
		if str(s.name).begins_with("Sec_") and not s.get_node("NotesWrap").visible:
			closed = s
			break
	if closed:
		await _tap(closed.find_child("Toggle", true, false), "open a section")
		_step("tapping a section opens it", closed.get_node("NotesWrap").visible)
		await _shot("listen-section")
	# 4 · read
	await _tap("Tab_read", "Read tab")
	ok = await _wait(func(): return _find("Pane_read") != null and _find("Pane_read").visible)
	_step("Read tab", ok)
	var read = lesson.tab_node("read")
	var first_sec := ""
	for s in lesson.ch.sections:
		if int(s.p) == read.page:
			first_sec = s.t
			break
	_step("Read control names the section the page starts with", first_sec == "" or read._sec_l.text == first_sec, read._sec_l.text)
	_step("the title follows the tab", lesson.sub_l.text.begins_with("Read"), lesson.sub_l.text)
	await _shot("read")
	var p0: int = read.page
	await _tap("NextPage", "› next page")
	_step("› next page", read.page > p0, "%d → %d" % [p0, read.page])
	await _tap("PrevPage", "‹ previous page")
	_step("‹ previous page", read.page == p0)
	read._term_clicked(0)
	ok = await _wait(func(): return App.main.has_sheet() and _find("TermCard") != null)
	_step("a key term explains itself", ok)
	await _shot("read-term")
	await _back()
	_step("Back closes the sheet", not App.main.has_sheet())
	await _tap("ReadAloud", "▶ read page aloud")
	ok = await _wait(func(): return lesson.player.playing)
	_step("▶ reads the page aloud", ok)
	lesson.player.stop()
	# 5 · hologram tab (chapter 1 has none → chapter 3)
	await _tap("Tab_holo", "Hologram tab")
	_step("Hologram tab without figures explains itself", _find("Pane_holo") != null)
	await _tap("ChaptersBtn", "☰ chapters")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Ch3") != null)
	_step("☰ lists the chapters", ok)
	await _shot("chapters")
	await _tap("Ch3", "chapter 3")
	ok = await _wait(func(): return lesson.ch_no == 3 and not App.main.has_sheet())
	_step("picking chapter 3 switches the lesson", ok, lesson.title_l.text)
	ok = await _wait(func(): return _find("Holo_p11-3-2") != null, 8)
	_step("chapter 3 lists its hologram", ok)
	await _shot("holo-tab")
	await _tap("Holo_p11-3-2", "the hologram card")
	ok = await _wait(func(): return _top().name == "Holo" and _top().view.model != null, 20)
	_step("the hologram loads in 3-D", ok)
	if ok:
		var hv: HoloView = _top().view
		var n_labels: int = hv.variant.labels.size()
		_step("its labels are drawn", hv._pills.size() == n_labels and n_labels > 0, "%d labels" % hv._pills.size())
		await _frames(20)
		await _shot("hologram")
		await _tap("QuizBtn", "label quiz")
		_step("label quiz hides the names", hv.quiz and hv._pills[0].pill.text == "1")
		await _tap(hv._pills[0].pill, "a numbered label")
		ok = await _wait(func(): return App.main.has_sheet() and hv.revealed.has(0))
		_step("tapping a label reveals and explains it", ok)
		await _back()
		await _tap("LabelsBtn", "labels off")
		_step("labels can be hidden", not hv.labels_on)
		await _tap("LabelsBtn", "labels on")
	await _back()
	# a hologram with a slider (take apart)
	await App.load_holo_index()
	var slid := ""
	for f in App.holo_index:
		if str(f.variants[0].get("slider", "")) != "":
			slid = f.id
			break
	App.push(HoloScreen.new(slid, 0))
	ok = await _wait(func(): return _top().name == "Holo" and _top().view.model != null, 20)
	_step("a moving hologram loads (%s)" % slid, ok)
	if ok:
		var hv2: HoloView = _top().view
		_step("its slider is shown", _find("SliderRow").visible and hv2.has_slider())
		var probe := _moving_node(hv2)
		var a0: Vector3 = probe.global_position if probe else Vector3.ZERO
		(_find("Slider") as HSlider).value = 1.0
		await _frames(4)
		var a1: Vector3 = probe.global_position if probe else Vector3.ZERO
		_step("the slider moves the parts", probe != null and a0.distance_to(a1) > 0.01, "moved %.2f" % a0.distance_to(a1))
		await _shot("hologram-slider")
	await _back()
	# 6 · summary + quiz + mission
	await _tap("Tab_summary", "Summary tab")
	ok = await _wait(func(): return _find("Pane_summary") != null and _find("Pane_summary").visible)
	_step("Summary tab", ok)
	await _shot("summary")
	await _tap("StartQuiz", "start the quiz")
	var answered := 0
	for i in 8:
		var opt := _find("Opt0")
		if opt == null:
			break
		await _tap(opt, "an answer")
		var nq := _find("NextQ")
		if nq == null:
			break
		answered += 1
		await _tap(nq, "next question")
	ok = await _wait(func(): return _find("Score") != null)
	_step("the recall quiz runs to a score", ok, "%d answered" % answered)
	_step("the best score is kept", int(App.chap(lesson.key).quiz) >= 0)
	await _shot("summary-quiz")
	await _tap("Mission4", "chapter 4 in the list")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Go_read") != null)
	_step("a chapter in the list asks where to go", ok)
	await _tap("Go_read", "📄 Read")
	ok = await _wait(func(): return lesson.ch_no == 4 and lesson.tab == "read")
	_step("…and opens chapter 4 on Read", ok)
	await _tap("OptionsBtn", "⋯ options")
	ok = await _wait(func(): return App.main.has_sheet() and _find("AutoAdvance") != null)
	_step("⋯ shows listening options", ok)
	await _shot("options")
	await _back()
	# 7 · home again: continue card
	await _back()
	await _back()
	ok = await _wait(func(): return _top().name == "Home" and _find("ContinueCard") != null)
	_step("home offers Continue", ok)
	await _shot("home-continue")
	# 8 · hologram room
	await _tap("HoloRoom", "Hologram Room")
	ok = await _wait(func(): return _top().name == "HoloRoom" and _find("Figures") != null and _find("Figures").get_child_count() > 100, 10)
	_step("Hologram Room lists the figures", ok, "%d rows" % (_find("Figures").get_child_count() if _find("Figures") else 0))
	await _tap("Sub_phy", "Physics filter")
	await _frames(4)
	var phy_ok := true
	for c in _find("Figures").get_children():
		if str(c.name).begins_with("Fig_") and not str(c.name).begins_with("Fig_p"):
			phy_ok = false
	_step("the Physics filter shows only physics", phy_ok)
	await _shot("holo-room")
	await _back()
	# 9 · practice: tap & answer, save & exit, continue
	await _tap("PracticeCard", "Practice")
	ok = await _wait(func(): return _top().name == "Practice" and _find("StartBtn") != null, 10)
	_step("Practice opens", ok)
	await _shot("practice")
	await _tap("StartBtn", "start a round")
	ok = await _wait(func(): return _find("Opt0") != null)
	_step("a round starts", ok)
	var r: Dictionary = App.data.practice.round
	var right := int(r.qs[0].answer)
	await _tap("Opt%d" % right, "the right answer")
	ok = await _wait(func(): return _find("Feedback") != null)
	_step("the right answer is marked correct", ok and int(r.score) == 1)
	await _shot("practice-answered")
	await _tap("NextBtn", "next question")
	await _tap("SaveExit", "save & exit")
	ok = await _wait(func(): return _find("ContinueRound") != null)
	_step("Save & exit keeps the round", ok)
	await _tap("ContinueBtn", "continue")
	ok = await _wait(func(): return _find("Opt0") != null and int(App.data.practice.round.i) == 1)
	_step("Continue resumes at question 2", ok)
	await _tap("SaveExit", "save & exit")
	# 10 · shooter
	await _tap("Mode_shooter", "Space shooter mode")
	await _tap("StartBtn", "start the game")
	ok = await _wait(func(): return _top().name == "Shooter" and _top().game.ships.size() >= 2, 10)
	_step("the shooter starts with answer ships", ok)
	if ok:
		var g = _top().game
		g.manual = true
		for i in 40: # the drones slide in and wait while the question is read
			g.step(0.016)
		await _shot("shooter")
		var s0: int = g.score
		g.shoot_option(int(g.q.answer))
		for i in 10:
			g.step(0.016)
		_step("hitting the right ship scores", g.score > s0, "score %d" % g.score)
		await _shot("shooter-hit")
		_step("the game is saved after the hit", int(App.data.practice.get("shooter", {}).get("score", -1)) == g.score)
		# the controls, with real input events: the ship follows the mouse; a finger steers by dragging (relative)
		# without firing, and lifting it fires
		var xf: Transform2D = App.main.get_viewport().get_final_transform()
		var o: Vector2 = g.get_global_rect().position
		var fy: float = g.size.y * 0.6
		var mv := InputEventMouseMotion.new()
		mv.position = xf * (o + Vector2(g.size.x * 0.25, fy))
		mv.global_position = mv.position
		App.main.get_viewport().push_input(mv)
		await _frames(2)
		_step("the ship follows the mouse", absf(g.target_x - g.size.x * 0.25) < 2.0, "target %.0f, mouse %.0f" % [g.target_x, g.size.x * 0.25])
		var shots: int = g.bullets.size()
		var x0: float = g.target_x
		for k in 3: # finger down · drag 40 px right · lift
			var e: InputEvent
			if k == 1:
				e = InputEventScreenDrag.new()
				e.index = 0
				e.position = xf * (o + Vector2(g.size.x * 0.5 + 40, fy))
				e.relative = Vector2(40, 0)
			else:
				e = InputEventScreenTouch.new()
				e.index = 0
				e.pressed = k == 0
				e.position = xf * (o + Vector2(g.size.x * 0.5 + (40 if k == 2 else 0), fy))
			App.main.get_viewport().push_input(e)
			await _frames(2)
			if k == 1:
				_step("a finger drag steers the ship without firing", absf(g.target_x - (x0 + 54.0)) < 2.0 and g.bullets.size() == shots, "moved %.0f, shots %d" % [g.target_x - x0, g.bullets.size() - shots])
		_step("lifting the finger fires", g.bullets.size() == shots + 1, "shots %d" % (g.bullets.size() - shots))
		await _back()
		_step("Back pauses the game", g.paused and _find("PauseBox").visible)
		await _shot("shooter-paused")
		await _back()
		ok = await _wait(func(): return _top().name == "Practice" and _find("ContinueGame") != null)
		_step("second Back leaves, the game can be continued", ok)
	await _back()
	_step("Back returns home", _top().name == "Home")
	# 11 · appearance: Calm night, then back to Calm
	await _tap("AppearanceBtn", "theme and text size")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Theme_calm_night") != null)
	_step("the Appearance sheet lists the themes", ok)
	await _shot("appearance")
	await _tap("Theme_calm_night", "Calm night")
	ok = await _wait(func(): return UI.palette == "calm_night" and _top().name == "Home" and not App.main.has_sheet())
	_step("Calm night applies", ok)
	await _shot("home-night")
	await _tap("AppearanceBtn", "theme and text size")
	await _wait(func(): return _find("Theme_calm") != null)
	await _tap("Theme_calm", "Calm")
	ok = await _wait(func(): return UI.palette == "calm" and _top().name == "Home")
	_step("Calm applies again", ok)
	# 12 · your own PDF
	await _book_flow()


func _moving_node(hv: HoloView) -> Node3D:
	if hv.anim == null:
		return null
	var a: Animation = hv.anim.get_animation("slider")
	var root := hv.anim.get_node(hv.anim.root_node)
	for t in a.get_track_count():
		if a.track_get_type(t) == Animation.TYPE_POSITION_3D:
			var n := root.get_node_or_null(NodePath(str(a.track_get_path(t)).get_slice(":", 0)))
			if n is Node3D:
				return n
	return null


# ───────── your own PDF: add it, study it, practise it, add it again, delete it ─────────

func _book_flow() -> void:
	var upload := _web and int(JavaScriptBridge.eval("location.search.indexOf('upload') >= 0 ? 1 : 0", true)) == 1
	var books_before := Library.books().size()
	_step("Home offers Add a PDF", _find("AddBook") != null)
	await _tap("AddBook", "Add a PDF")
	var ok := await _wait(func(): return App.main.has_sheet() and _find("ImportSheet") != null)
	_step("Add a PDF says what it will make", ok)
	await _shot("import-intro")
	var flow: ImportFlow = ImportFlow.current
	var sample := ""
	if upload: # a real tap → the browser's file picker → the driver hands it the sample PDF
		JavaScriptBridge.eval("window.__pickFile = 'sample-book.pdf'")
		await _real_tap("ChoosePdf", "Choose a PDF")
		ok = await _wait(func(): return flow.state != "picking" and flow.state != "intro", 20)
		_step("the picked PDF starts converting", ok and flow.state in ["running", "done"], flow.state)
		await _wait(func(): return flow.steps.size() >= 4 or flow.state != "running", 60)
		await _shot("import-progress")
		await _wait(func(): return flow.state in ["done", "error", "intro"], 300)
		_step("the PDF becomes a book", flow.state == "done", flow.error if flow.state == "error" else "%d progress updates" % flow.steps.size())
		var fr: Array = flow.steps.map(func(x): return float(x[1]))
		var up := not fr.is_empty()
		for i in range(1, fr.size()):
			if fr[i] < fr[i - 1]:
				up = false
		_step("the import's progress only goes up and ends at 100 %", up and is_equal_approx(float(fr.back()), 1.0), "%d updates, last %s" % [fr.size(), str(fr.back()) if not fr.is_empty() else "-"])
		sample = str(JavaScriptBridge.eval("HoloImport.lastPack || ''", true))
		JavaScriptBridge.eval("window.__holoSamplePack = HoloImport.lastPack")
	else: # desktop: the browser's own output for that PDF (tools/godot-webtest.mjs --fixture)
		sample = FileAccess.get_file_as_string("res://tests/sample-book.json")
		_step("the converted sample book is there (godot/tests/sample-book.json)", sample != "")
		flow._js_started(["sample-book.pdf", sample.length(), ""])
		flow._js_progress(["Reading pages 10/40", 0.2])
		await _shot("import-progress")
		flow._js_progress(["Done", 1.0])
		flow.finish(sample)
	if flow.state != "done":
		return
	await _shot("import-done")
	var id := str(flow.result.id)
	var e := Library.entry(id)
	_step("the book is in the library", e.get("chapters", []).size() == 3 and Library.books().size() == books_before + 1, "%d chapters · %d voice notes · %d MCQs · %d holograms" % [e.get("chapters", []).size(), int(e.get("notes", 0)), int(e.get("mcq", 0)), int(e.get("holos", 0))])
	_step("its pages and questions are saved on the device", FileAccess.file_exists(Library.pack_path(id)) and FileAccess.file_exists(Library.mcq_path(id)))
	await _tap("OpenBook", "Open the book")
	ok = await _wait(func(): return _top().name == "Book" and _find("BookCh3") != null)
	_step("Open the book lists its chapters", ok)
	await _shot("book")
	# chapter 1 · Listen
	await _tap("BookCh1", "chapter 1")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Act_practice") != null)
	_step("a book chapter offers Listen, Read, Summary, Hologram and Practice", ok and _find("Act_listen") != null and _find("Act_holo") != null)
	await _shot("book-chapter-sheet")
	await _tap("Act_listen", "Listen")
	ok = await _wait(func(): return _top() is LessonScreen and not _top().pack.is_empty() and _find("Pane_listen") != null, 20)
	_step("the book chapter opens in Listen", ok)
	if not ok:
		return
	var lesson: LessonScreen = _top()
	var key := App.chapter_key(id, 1)
	await _frames(8)
	await _tap("Play", "▶ play")
	ok = await _wait(func(): return lesson.player.playing)
	_step("▶ reads the book's voice notes aloud", ok, "%d notes" % lesson.ch.notes.size())
	await _shot("book-listen")
	await _wait(func(): return lesson.player.idx >= 2, 20)
	lesson.player.stop()
	_step("notes heard are counted", App.heard_count(key) >= 1, "%d heard" % App.heard_count(key))
	# Read
	await _tap("Tab_read", "Read tab")
	var read: Control = lesson.tab_node("read")
	ok = await _wait(func(): return read != null and read.visible)
	var p0: int = read.page if read else 0
	await _tap("NextPage", "› next page")
	_step("Read turns the book's pages", ok and read.page > p0, "%d → %d" % [p0, read.page if read else 0])
	await _shot("book-read")
	# Hologram: this chapter is Biological Classification → that NCERT chapter's figures
	await _tap("Tab_holo", "Hologram tab")
	ok = await _wait(func(): return _find("Holo_b11-2-1") != null, 10)
	_step("chapter 1 shows the holograms of its NCERT chapter", ok)
	await _shot("book-holo")
	if ok:
		await _tap("Holo_b11-2-1", "a hologram")
		ok = await _wait(func(): return _top().name == "Holo" and _top().view.model != null, 20)
		_step("…and it opens in 3-D", ok)
		await _back()
	# Summary + recall quiz
	await _tap("Tab_summary", "Summary tab")
	await _wait(func(): return _find("Pane_summary") != null and _find("Pane_summary").visible)
	_step("Summary lists the chapter's key points", not lesson.ch.summary.is_empty(), "%d points · %d quiz questions" % [lesson.ch.summary.size(), lesson.ch.quiz.size()])
	if _find("StartQuiz"):
		await _tap("StartQuiz", "start the quiz")
		for i in 8:
			var opt := _find("Opt0")
			if opt == null:
				break
			await _tap(opt, "an answer")
			var nq := _find("NextQ")
			if nq == null:
				break
			await _tap(nq, "next question")
		ok = await _wait(func(): return _find("Score") != null)
		_step("the book's recall quiz runs to a score that is kept", ok and int(App.chap(key).quiz) >= 0)
		await _shot("book-quiz")
	# chapter 3 has a made-up title: its holograms come from what its text talks about
	await _tap("ChaptersBtn", "☰ chapters")
	await _wait(func(): return App.main.has_sheet() and _find("Ch3") != null)
	await _tap("Ch3", "chapter 3")
	await _wait(func(): return lesson.ch_no == 3 and not App.main.has_sheet())
	await _tap("Tab_holo", "Hologram tab")
	await _wait(func(): return lesson.tab_node("holo") != null, 5)
	await _frames(10)
	var found := ""
	for n in lesson.tab_node("holo").find_children("Holo_*", "", true, false):
		found += str(n.name).trim_prefix("Holo_") + " "
	_step("chapter 3's holograms are matched by its text", found.contains("b11-3-"), found.strip_edges())
	await _shot("book-holo-matched")
	# back on the book: the progress shows
	await _back()
	ok = await _wait(func(): return _top().name == "Book")
	var f := Library.fraction(Library.entry(id))
	var pct: Label = _find("BookPct") as Label
	_step("the book shows its progress", ok and f > 0.0 and pct != null and pct.text != "0%", "%d%%" % int(round(f * 100)))
	await _shot("book-progress")
	# Practice from chapter 1
	await _tap("BookCh1", "chapter 1")
	await _wait(func(): return _find("Act_practice") != null)
	await _tap("Act_practice", "Practice")
	ok = await _wait(func(): return _top().name == "Practice" and _find("StartBtn") != null, 10)
	_step("Practice opens with the chapter chosen", ok and App.data.practice.get("sel", []) == [key])
	await _shot("book-practice-home")
	await _tap("StartBtn", "start a round")
	ok = await _wait(func(): return _find("Opt0") != null)
	var r: Dictionary = App.data.practice.get("round", {})
	var from_book: bool = ok and not r.is_empty() and r.qs.all(func(q): return str(q.chapter) == key)
	_step("the round's questions come from the book", from_book, "%d questions" % r.get("qs", []).size())
	if from_book:
		await _tap("Opt%d" % int(r.qs[0].answer), "the right answer")
		ok = await _wait(func(): return _find("Feedback") != null)
		_step("the right answer scores", ok and int(r.score) == 1)
		_step("the explanation shows the book's sentence", str(r.qs[0].hint).begins_with("Page "), str(r.qs[0].hint).left(60))
		await _shot("book-practice")
		await _tap("SaveExit", "save & exit")
	await _back()
	await _back()
	# the save holds the book and its progress
	App.save_now()
	var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(App.SAVE_PATH))
	ok = saved is Dictionary and saved.get("books", []).any(func(b): return str(b.id) == id) and saved.chapters.has(key) and saved.chapters[key].heard.size() >= 1
	_step("the book and its progress are saved", ok)
	# every chapter's progress stays within its notes
	var sane := true
	var detail := ""
	for c in Library.entry(id).chapters:
		var k := App.chapter_key(id, int(c.n))
		var fr2 := App.chapter_fraction(k)
		if fr2 < 0.0 or fr2 > 1.0 or App.heard_count(k) > int(c.notes):
			sane = false
		detail += "%d%% " % int(round(fr2 * 100))
	_step("every chapter's progress is between 0 and 100 %", sane, detail.strip_edges())
	# Home: the book with its progress, Continue goes to it
	if _top().name != "Home":
		await _back()
	ok = await _wait(func(): return _top().name == "Home" and _find("Book_" + id) != null and _find("ContinueCard") != null)
	_step("Home shows the book and continues in it", ok and str(App.data.last).begins_with(id + ":"), str(App.data.last))
	await _shot("home-with-book")
	# the same file again: scanned afresh, progress kept
	var heard := App.heard_count(key)
	var again := ImportFlow.open()
	again.finish(sample)
	_step("adding the same PDF again keeps the progress", again.result.get("replaced", false) and App.heard_count(key) == heard and Library.books().size() == books_before + 1, "%d heard" % App.heard_count(key))
	if upload: # files that cannot become a book, and stopping an import
		JavaScriptBridge.eval("window.__pickFile = 'scanned.pdf'")
		await _tap("AddAnother", "Add another PDF")
		await _real_tap("ChoosePdf", "Choose a PDF")
		await _wait(func(): return again.state in ["error", "done"], 60)
		_step("a scanned PDF gets a clear message", again.state == "error" and again.error.contains("scan"), again.error.left(70))
		await _shot("import-error")
		JavaScriptBridge.eval("window.__pickFile = 'broken.pdf'")
		await _real_tap("ChoosePdf", "Choose another PDF")
		await _wait(func(): return again.state == "error" and again.error.contains("opened"), 60)
		_step("a damaged file gets a clear message", again.error.contains("could not be opened"), again.error.left(70))
		JavaScriptBridge.eval("window.__pickFile = 'sample-copy.pdf'")
		await _real_tap("ChoosePdf", "Choose another PDF")
		await _wait(func(): return again.state == "running" and again.steps.size() >= 1, 30)
		await _tap("CancelImport", "Cancel")
		ok = await _wait(func(): return again.state == "intro", 30)
		_step("Cancel stops the import and adds nothing", ok and Library.books().size() == books_before + 1, again.state)
		JavaScriptBridge.eval("window.__pickFile = 'sample-copy.pdf'")
		await _real_tap("ChoosePdf", "Choose a PDF")
		await _wait(func(): return again.state == "running" and again.steps.size() >= 1, 30)
		var gone: WeakRef = weakref(again) # the flow frees itself once the browser confirms the stop
		await _back()
		ok = await _wait(func(): return gone.get_ref() == null, 30)
		_step("closing the sheet stops the import too", ok and not App.main.has_sheet() and Library.books().size() == books_before + 1)
		var busy := int(JavaScriptBridge.eval("HoloImport.busy() ? 1 : 0", true))
		_step("…and the browser is not still working on it", busy == 0)
	if App.main.has_sheet():
		await _back()
	# delete: the book and everything that belongs to it
	await _tap("Book_" + id, "the book")
	await _wait(func(): return _top().name == "Book")
	await _tap("BookOptions", "⋯ book options")
	await _wait(func(): return _find("DeleteBook") != null)
	await _tap("DeleteBook", "Delete this book")
	await _wait(func(): return _find("DeleteConfirm") != null)
	await _shot("book-delete")
	await _tap("DeleteConfirm", "Delete")
	ok = await _wait(func(): return _top().name == "Home" and _find("Book_" + id) == null)
	var left := 0
	for k in App.data.chapters:
		if str(k).begins_with(id + ":"):
			left += 1
	_step("Delete removes the book, its files and its progress", ok and Library.entry(id).is_empty() and left == 0 and not FileAccess.file_exists(Library.pack_path(id)) and not str(App.data.last).begins_with(id))
	_step("…and Practice no longer offers it", not App.data.practice.get("sel", []).has(key) and not PracticeBank.chapters().any(func(c): return str(c.id).begins_with(id)))
	await _shot("home-after-delete")

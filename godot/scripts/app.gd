extends Node
## App: content loading, saved progress and settings, navigation helpers (autoload "App").
## Content (res://content, produced by tools/godot-content.mjs) is fetched over HTTP on the Web export —
## it sits next to index.html — and read from disk everywhere else.

signal progress_changed

const SAVE_PATH := "user://holostudy.json"
const PACK_IDS := ["physics11", "physics12", "chemistry11", "chemistry12", "biology11", "biology12"]

var main # scripts/main.gd (untyped: screens call its helpers)
var curriculum := {}
var holo_index: Array = []
var holo_by_id := {}
var practice_data := {}
var data := {}
var base_url := ""
var autotest := false
var _packs := {}
var _loading := {}
var _save_timer: Timer
var _js_back: JavaScriptObject
var skip_pop := 0 # history.back() calls made by the app itself (closing a sheet from code)


func _ready() -> void:
	if OS.has_feature("web"):
		base_url = str(JavaScriptBridge.eval("new URL('.', document.baseURI).href", true))
		autotest = int(JavaScriptBridge.eval("location.search.indexOf('autotest') >= 0 ? 1 : 0", true)) == 1
	autotest = autotest or OS.get_cmdline_user_args().has("--autotest")
	if autotest:
		print("HoloStudy autotest on")
	_save_timer = Timer.new()
	_save_timer.one_shot = true
	_save_timer.wait_time = 0.6
	_save_timer.timeout.connect(_write)
	add_child(_save_timer)
	_load_progress()


# ───────── content ─────────

func fetch_bytes(rel: String) -> PackedByteArray:
	if OS.has_feature("web"):
		var req := HTTPRequest.new()
		req.download_chunk_size = 262144
		req.timeout = 60
		add_child(req)
		if req.request(base_url + "content/" + rel) != OK:
			req.queue_free()
			return PackedByteArray()
		var res: Array = await req.request_completed
		req.queue_free()
		if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
			push_warning("fetch failed %s (%s/%s)" % [rel, res[0], res[1]])
			return PackedByteArray()
		return res[3]
	for root in ["res://content/", OS.get_executable_path().get_base_dir() + "/content/"]:
		if FileAccess.file_exists(root + rel):
			return FileAccess.get_file_as_bytes(root + rel)
	push_warning("missing content " + rel)
	return PackedByteArray()


func fetch_json(rel: String) -> Variant:
	var b := await fetch_bytes(rel)
	if b.is_empty():
		return null
	return JSON.parse_string(b.get_string_from_utf8())


## everything the home screen needs (small); books and models load when they are opened
func boot() -> void:
	var cur = await fetch_json("curriculum.json")
	curriculum = cur if cur is Dictionary else {"subjects": []}


func load_pack(id: String) -> Dictionary:
	if _packs.has(id):
		return _packs[id]
	if _loading.has(id): # someone else is already downloading it
		while _loading.has(id):
			await get_tree().process_frame
		return _packs.get(id, {})
	_loading[id] = true
	var p = await fetch_json("packs/%s.json" % id)
	_loading.erase(id)
	if p is Dictionary:
		_packs[id] = p
		return p
	return {}


func load_holo_index() -> Array:
	if holo_index.is_empty():
		var idx = await fetch_json("holo/index.json")
		if idx is Array:
			holo_index = idx
			for f in holo_index:
				holo_by_id[f.id] = f
	return holo_index


func load_practice() -> Dictionary:
	if practice_data.is_empty():
		var p = await fetch_json("practice.json")
		if p is Dictionary:
			practice_data = p
	return practice_data


func subjects() -> Array:
	return curriculum.get("subjects", [])


func subject(key: String) -> Dictionary:
	for s in subjects():
		if s.key == key:
			return s
	return {}


## {subject, cls, chapter} for a pack id + chapter number
func find_chapter(pack: String, no: int) -> Dictionary:
	for s in subjects():
		for c in s.classes:
			if c.pack == pack:
				for ch in c.chapters:
					if int(ch.no) == no:
						return {"subject": s, "cls": c, "chapter": ch}
	return {}


# ───────── progress & settings ─────────

func _defaults() -> Dictionary:
	return {"v": 1, "chapters": {}, "holos": {}, "practice": {}, "last": "",
		"settings": {"rate": 1.0, "voice": "", "auto_advance": true, "key_only": false, "text_size": 1.0, "labels": true}}


func _load_progress() -> void:
	data = _defaults()
	if FileAccess.file_exists(SAVE_PATH):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
		if parsed is Dictionary:
			for k in parsed:
				data[k] = parsed[k]
			var d := _defaults()
			for k in d.settings:
				if not data.settings.has(k):
					data.settings[k] = d.settings[k]


func save() -> void:
	_save_timer.start()


func _write() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))
		f.close()
	progress_changed.emit()


func setting(key: String, def: Variant = null) -> Variant:
	return data.settings.get(key, def)


func set_setting(key: String, v: Variant) -> void:
	data.settings[key] = v
	save()


static func chapter_key(pack: String, no: int) -> String:
	return "%s:%d" % [pack, no]


func chap(key: String) -> Dictionary:
	if not data.chapters.has(key):
		data.chapters[key] = {"heard": {}, "page": 0, "note": 0, "tab": "listen", "quiz": -1, "opened": Time.get_unix_time_from_system(), "last": 0, "notes": 0}
	return data.chapters[key]


func touch_chapter(key: String, tab: String) -> void:
	var c := chap(key)
	c.last = Time.get_unix_time_from_system()
	c.tab = tab
	data.last = key
	save()


## note id: "<i>" for the i-th voice note, "k<i>" for a key point
func mark_heard(key: String, note_id: String, total: int) -> void:
	var c := chap(key)
	c.heard[note_id] = true
	c.notes = total
	save()


## voice notes heard (key points are extra and not counted)
func heard_count(key: String) -> int:
	if not data.chapters.has(key):
		return 0
	var n := 0
	for k in data.chapters[key].heard:
		if not str(k).begins_with("k"):
			n += 1
	return n


## 0…1: notes heard, with a small credit for opening a chapter at all
func chapter_fraction(key: String) -> float:
	if not data.chapters.has(key):
		return 0.0
	var c: Dictionary = data.chapters[key]
	var n := int(c.get("notes", 0))
	var heard: float = float(heard_count(key)) / n if n > 0 else 0.0
	var quiz: float = 0.15 if int(c.get("quiz", -1)) >= 0 else 0.0
	return clampf(0.05 + heard * 0.8 + quiz, 0.0, 1.0)


func subject_fraction(s: Dictionary) -> float:
	var total := 0
	var sum := 0.0
	for c in s.classes:
		for ch in c.chapters:
			total += 1
			sum += chapter_fraction(chapter_key(c.pack, int(ch.no)))
	return sum / total if total > 0 else 0.0


func mark_holo(id: String) -> void:
	data.holos[id] = Time.get_unix_time_from_system()
	save()


# ───────── navigation (browser Back, Esc, Android back) ─────────

func push(screen: Control) -> void:
	main.push(screen)
	_history_push()


func back() -> void:
	if OS.has_feature("web") and main.depth() > 1 and not autotest:
		JavaScriptBridge.eval("history.back()") # the popstate handler pops the screen
	else:
		main.back()


func _history_push() -> void:
	if not OS.has_feature("web") or autotest:
		return
	JavaScriptBridge.eval("history.pushState({hs: Date.now()}, '')")
	if _js_back == null:
		_js_back = JavaScriptBridge.create_callback(_on_popstate)
		JavaScriptBridge.get_interface("window").addEventListener("popstate", _js_back)


func _on_popstate(_args: Array) -> void:
	if skip_pop > 0:
		skip_pop -= 1
		return
	main.back()


func toast(text: String) -> void:
	if main:
		main.toast(text)

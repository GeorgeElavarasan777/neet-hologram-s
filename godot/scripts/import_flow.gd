class_name ImportFlow
extends Node
## "Add a PDF": the sheet that says what will be made, opens the browser's file picker, shows the
## conversion step by step and adds the book. The work happens in the browser (web/import/driver.js:
## pdf.js + the study console's own scanner); this node only talks to it and keeps the sheet up to date.
## One import at a time. Closing the sheet (✕, Back) stops it and nothing is added. A PDF dropped on the
## page starts here too (App._on_dropped).

const API := 1

static var current: ImportFlow

var state := "intro" # intro · picking · running · asking · done · error
var steps: Array = [] # [stage, fraction] as reported (the autotest checks them)
var result := {} # Library.install(): {id, entry, replaced}
var error := ""
var install_ms := -1 # how long adding the converted book to the library took (the capacity test reads it)
var _box: VBoxContainer
var _bar: ProgressBar
var _stage: Label
var _pct: Label
var _name := ""
var _pages := 0
var _limit := 0
var _cbs: Array = [] # the JS callbacks must stay referenced while the browser can call them
var _closing := false # the sheet went while the browser was still working: free on its last word


## Home → "Add a PDF"
static func open() -> ImportFlow:
	var f := _fresh()
	f._intro()
	return f


## a file the page can fetch (the capacity test): straight to the progress view
static func start_url(url: String, file_name: String) -> ImportFlow:
	var f := _fresh()
	var hi := f._api()
	if hi == null:
		return f
	f._name = file_name
	f._running_view()
	hi.convertUrl(url, file_name, f._handlers())
	return f


## a file dropped on the page: straight to the progress view
static func start_dropped(file_name: String) -> void:
	var f := _fresh()
	var hi := f._api()
	if hi == null:
		return
	f._name = file_name
	f._running_view()
	hi.convertDropped(f._handlers())


static func _fresh() -> ImportFlow:
	if current and is_instance_valid(current):
		current._stop()
	var f := ImportFlow.new()
	f.name = "ImportFlow"
	App.add_child(f)
	current = f
	f._box = UI.vbox(12)
	f._box.name = "ImportSheet"
	f._box.tree_exiting.connect(f._on_sheet_gone)
	App.main.open_sheet("Add your own book", f._box, 560)
	return f


func busy() -> bool:
	return state in ["picking", "running", "asking"]


# ───────── the browser side ─────────

func _api() -> JavaScriptObject:
	if not OS.has_feature("web"):
		return null
	var hi: JavaScriptObject = JavaScriptBridge.get_interface("HoloImport")
	if hi == null or int(hi.version) != API:
		_fail("The PDF reader is missing from this copy of HoloStudy. Reload the page; if this stays, the site has to be built again (node tools/godot-build.mjs).")
		return null
	return hi


func _handlers() -> JavaScriptObject:
	_cbs.clear()
	var h: JavaScriptObject = JavaScriptBridge.create_object("Object")
	for pair in [["onStarted", _js_started], ["onProgress", _js_progress], ["onAsk", _js_ask], ["onDone", _js_done],
			["onError", _js_error], ["onCancelled", _js_cancelled], ["onPickCancelled", _js_pick_cancelled]]:
		var cb := JavaScriptBridge.create_callback(pair[1])
		_cbs.append(cb)
		h.set(pair[0], cb)
	_cbs.append(h)
	return h


func _pick() -> void:
	var hi := _api()
	if hi == null:
		return
	state = "picking"
	error = ""
	hi.pick(_handlers())


func _stop() -> void:
	if busy() and OS.has_feature("web"):
		var hi: JavaScriptObject = JavaScriptBridge.get_interface("HoloImport")
		if hi != null:
			hi.cancel()


func _js_started(args: Array) -> void:
	_name = str(args[0]) if args.size() > 0 else "document.pdf"
	steps.clear()
	_running_view()


func _js_progress(args: Array) -> void:
	var stage := str(args[0]) if args.size() > 0 else ""
	var f := clampf(float(args[1]) if args.size() > 1 else 0.0, 0.0, 1.0)
	steps.append([stage, f])
	if state == "asking":
		_running_view()
	if state != "running" or not is_instance_valid(_bar):
		return
	_bar.value = f
	_pct.text = "%d%%" % int(floor(f * 100.0))
	_stage.text = stage


func _js_ask(args: Array) -> void:
	_pages = int(args[0]) if args.size() > 0 else 0
	_limit = int(args[1]) if args.size() > 1 else 400
	_ask_view()


func _js_done(args: Array) -> void:
	if _closing:
		queue_free()
		return
	finish(str(args[0]) if args.size() > 0 else "")


func _js_error(args: Array) -> void:
	if _closing:
		queue_free()
		return
	_fail(str(args[0]) if args.size() > 0 else "Something went wrong. Try again.")


func _js_cancelled(_args: Array) -> void:
	if _closing:
		queue_free()
		return
	_intro()
	App.toast("Stopped — nothing was added")


func _js_pick_cancelled(_args: Array) -> void:
	if state == "picking":
		state = "intro"


## the converted book (JSON in the NCERT pack format) → the library (also the autotest's way in)
func finish(json_text: String) -> void:
	var t := Time.get_ticks_msec()
	var r := Library.install(json_text)
	install_ms = Time.get_ticks_msec() - t
	if r.has("error"):
		_fail(str(r.error))
		return
	result = r
	_done_view()


func _on_sheet_gone() -> void:
	if busy():
		_closing = true
		_stop()
		if state == "picking": # the picker may never answer
			queue_free()
	else:
		queue_free()
	if current == self:
		current = null


# ───────── views ─────────

func _intro() -> void:
	state = "intro"
	if not is_instance_valid(_box):
		return
	UI.clear(_box)
	_box.add_child(UI.label("Choose a PDF of a textbook, a chapter or your own notes. HoloStudy reads its text and makes:", 15, UI.TEXT2, null, true))
	var list := UI.vbox(10)
	for r in [["listen", "Listen", "voice notes for every section, read aloud word by word"],
			["read", "Read", "the book page by page, with its key terms explained"],
			["summary", "Summary", "the key points and a recall quiz for each chapter"],
			["holo", "Hologram", "3-D figures from the library that match each chapter"],
			["practice", "Practice", "multiple-choice questions written from the text"]]:
		var row := UI.hbox(12)
		row.add_child(UI.badge(r[0], UI.ACCENT, 36))
		var t := UI.vbox(0)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.add_child(UI.label(r[1], 15, UI.TEXT, UI.f_bold))
		t.add_child(UI.label(r[2], 13, UI.MUTED, null, true))
		row.add_child(t)
		list.add_child(row)
	_box.add_child(list)
	_box.add_child(UI.label("Text-based PDFs work (NCERT PDFs are). A scan — photos of pages — has no text to read. Your PDF stays on this device.", 13, UI.MUTED, null, true))
	if OS.has_feature("web"):
		var go := UI.btn("Choose a PDF", "primary", "upload")
		go.name = "ChoosePdf"
		go.custom_minimum_size.y = 52
		go.pressed.connect(_pick)
		_box.add_child(go)
		if not DisplayServer.is_touchscreen_available():
			var drop := UI.label("or drop a PDF anywhere on this page", 13, UI.MUTED)
			drop.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			_box.add_child(drop)
	else:
		_box.add_child(UI.label("Adding a PDF works in the browser version of HoloStudy.", 14, UI.WARN, UI.f_semi, true))


func _running_view() -> void:
	state = "running"
	App.main.sheet_modal = true
	if not is_instance_valid(_box):
		return
	UI.clear(_box)
	var head := UI.hbox(12)
	head.add_child(UI.badge("file", UI.ACCENT, 40))
	var name_l := UI.label(_name, 17, UI.TEXT, UI.f_serif_semi, true)
	name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(name_l)
	_box.add_child(head)
	var row := UI.hbox(10)
	_bar = UI.bar(0.0, UI.ACCENT, 8)
	_bar.name = "ImportBar"
	_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_bar)
	_pct = UI.label("0%", 14, UI.TEXT2, UI.f_semi)
	_pct.name = "ImportPct"
	_pct.custom_minimum_size.x = 44
	_pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(_pct)
	_box.add_child(row)
	_stage = UI.label("Starting…", 14, UI.TEXT2, null, true)
	_stage.name = "ImportStage"
	_box.add_child(_stage)
	if not steps.is_empty():
		_js_progress(steps.pop_back())
	_box.add_child(UI.label("A chapter takes a few seconds; a whole book a minute or two. Keep this page open.", 13, UI.MUTED, null, true))
	var stop := UI.btn("Cancel", "ghost", "close")
	stop.name = "CancelImport"
	stop.pressed.connect(_stop)
	_box.add_child(stop)


func _ask_view() -> void:
	state = "asking"
	if not is_instance_valid(_box):
		return
	UI.clear(_box)
	_box.add_child(UI.label(_name, 17, UI.TEXT, UI.f_serif_semi, true))
	_box.add_child(UI.label("This PDF has %d pages. Scanning more than %d pages at once is slow on this device — choose the pages to scan now (a few chapters at a time works best). You can add other pages later as another book." % [_pages, _limit], 14, UI.TEXT2, null, true))
	var row := UI.hbox(10)
	var from := _spin("From page", 1, _pages, 1)
	var to := _spin("to", 1, _pages, mini(_pages, _limit))
	row.add_child(from[0])
	row.add_child(to[0])
	_box.add_child(row)
	var note := UI.label("", 13, UI.MUTED, null, true)
	_box.add_child(note)
	var fit := func() -> void:
		var a := int(from[1].value)
		if int(to[1].value) < a:
			to[1].value = a
		if int(to[1].value) - a + 1 > _limit:
			to[1].value = a + _limit - 1
		note.text = "%d pages" % (int(to[1].value) - a + 1)
	from[1].value_changed.connect(func(_v: float) -> void: fit.call())
	to[1].value_changed.connect(func(_v: float) -> void: fit.call())
	fit.call()
	var go := UI.btn("Scan these pages", "primary", "play")
	go.name = "AskScan"
	go.custom_minimum_size.y = 50
	go.pressed.connect(func() -> void:
		var hi: JavaScriptObject = JavaScriptBridge.get_interface("HoloImport")
		_running_view()
		if hi != null:
			hi.answer(int(from[1].value), int(to[1].value)))
	_box.add_child(go)
	var stop := UI.btn("Cancel", "ghost")
	stop.pressed.connect(_stop)
	_box.add_child(stop)


func _spin(caption: String, lo: int, hi: int, v: int) -> Array:
	var col := UI.vbox(4)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_child(UI.label(caption, 13, UI.MUTED, UI.f_semi))
	var s := SpinBox.new()
	s.min_value = lo
	s.max_value = maxi(lo, hi)
	s.step = 1
	s.value = v
	s.rounded = true
	s.custom_minimum_size.y = 44
	s.get_line_edit().add_theme_font_size_override("font_size", 16)
	col.add_child(s)
	return [col, s]


func _done_view() -> void:
	state = "done"
	App.main.sheet_modal = false
	if not is_instance_valid(_box):
		return
	UI.clear(_box)
	var e: Dictionary = result.entry
	var color := UI.subject_color(str(e.subject))
	var head := UI.hbox(12)
	head.add_child(UI.badge("check", UI.GOOD, 40))
	var t := UI.vbox(2)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label("Ready to study", 13, UI.GOOD, UI.f_semi))
	var title_l := UI.label(str(e.title), 19, UI.TEXT, UI.f_serif_semi, true)
	title_l.name = "BookReady"
	t.add_child(title_l)
	head.add_child(t)
	_box.add_child(head)
	var chapters: int = e.chapters.size()
	var quiz := 0
	for c in e.chapters:
		if int(c.quiz) > 0:
			quiz += 1
	var size := UI.plural(int(e.pages), "page") if int(e.pages) > 0 else UI.plural(int(e.words), "word")
	var list := UI.vbox(8)
	for r in [["listen", "%s · %s" % [UI.plural(chapters, "chapter"), size], "%s and %s to listen to" % [UI.plural(int(e.notes), "voice note"), UI.plural(int(e.keys), "key point")]],
			["summary", "Summary", "key points for every chapter, a recall quiz for %d" % quiz],
			["practice", "Practice", UI.plural(int(e.mcq), "MCQ") + (" in Tap & answer and Space shooter" if int(e.mcq) > 0 else " — the text had too few key terms")],
			["holo", "Hologram", ("%s from the library match it" % UI.plural(int(e.holos), "3-D figure")) if int(e.holos) > 0 else "no 3-D figure in the library matches this book"]]:
		var row := UI.hbox(12)
		row.add_child(UI.badge(r[0], color, 34))
		var tv := UI.vbox(0)
		tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tv.add_child(UI.label(r[1], 15, UI.TEXT, UI.f_bold, true))
		tv.add_child(UI.label(r[2], 13, UI.MUTED, null, true))
		row.add_child(tv)
		list.add_child(row)
	_box.add_child(list)
	if result.get("replaced", false):
		_box.add_child(UI.label("You had added this file before: it was scanned again and your progress was kept.", 13, UI.TEXT2, null, true))
	var open := UI.btn("Open the book", "primary", "read", color)
	open.name = "OpenBook"
	open.custom_minimum_size.y = 52
	var id: String = result.id
	open.pressed.connect(func() -> void:
		App.main.close_sheet()
		App.push(BookScreen.new(id)))
	_box.add_child(open)
	var more := UI.btn("Add another PDF", "ghost", "upload")
	more.name = "AddAnother"
	more.pressed.connect(_intro)
	_box.add_child(more)


func _fail(msg: String) -> void:
	state = "error"
	error = msg
	App.main.sheet_modal = false
	if not is_instance_valid(_box):
		return
	UI.clear(_box)
	var c := UI.card(14, Color(UI.BAD, 0.08), 14, Color(UI.BAD, 0.4))
	c.name = "ImportError"
	UI.box(c).add_child(UI.label("This file could not be added", 15, UI.BAD, UI.f_bold, true))
	UI.box(c).add_child(UI.label(msg, 14, UI.TEXT, null, true))
	_box.add_child(c)
	if OS.has_feature("web"):
		var again := UI.btn("Choose another PDF", "primary", "upload")
		again.name = "ChoosePdf"
		again.custom_minimum_size.y = 52
		again.pressed.connect(_pick)
		_box.add_child(again)

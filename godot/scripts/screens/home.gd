class_name HomeScreen
extends Screen
## Home: continue where you left off, the three subjects with progress, Hologram Room and Practice.

var col: VBoxContainer
var _grid: GridContainer
var _explore: GridContainer


func _ready() -> void:
	name = "Home"
	build("HoloStudy", "NCERT Class 11 & 12 · NEET & boards", false)
	add_action("search", "Search chapters and holograms", _open_search, "SearchBtn")
	col = UI.vbox(14)
	body.add_child(UI.scroller(UI.pad(col, 16, 18, 16, 28)))
	render()


func on_resume() -> void:
	render()


func on_resize() -> void:
	_fit_columns()


func _fit_columns() -> void:
	var w: float = minf(App.main.size.x, 760.0) - 32.0 # the width of the centred column
	if _grid:
		_grid.columns = 3 if w >= 690 else (2 if w >= 500 else 1)
	if _explore:
		_explore.columns = 2 if w >= 500 else 1


func render() -> void:
	UI.clear(col)
	var last: String = App.data.get("last", "")
	var hello := UI.label("Welcome back" if last != "" else "Welcome to HoloStudy", 24, UI.TEXT, UI.f_bold)
	col.add_child(hello)
	col.add_child(UI.label("Listen to every chapter, read it page by page, turn the diagrams in 3-D, then check yourself.", 14, UI.TEXT2, null, true))
	if last != "":
		_continue_card(last)
	col.add_child(UI.spacer(0, 4))
	col.add_child(UI.eyebrow("Subjects"))
	_grid = GridContainer.new()
	_grid.add_theme_constant_override("h_separation", 12)
	_grid.add_theme_constant_override("v_separation", 12)
	for s in App.subjects():
		_grid.add_child(_subject_card(s))
	col.add_child(_grid)
	col.add_child(UI.spacer(0, 4))
	col.add_child(UI.eyebrow("Explore"))
	_explore = GridContainer.new()
	_explore.add_theme_constant_override("h_separation", 12)
	_explore.add_theme_constant_override("v_separation", 12)
	_explore.add_child(_link_card("HoloRoom", "holo", UI.ACCENT, "Hologram Room", "124 NCERT diagrams in 3-D — turn, zoom, take apart, label quiz", func() -> void: App.push(HoloRoomScreen.new())))
	_explore.add_child(_link_card("PracticeCard", "practice", UI.WARN, "Practice", "Class 10 maths MCQs · Tap & answer or Space shooter", func() -> void: App.push(PracticeScreen.new())))
	col.add_child(_explore)
	_fit_columns()
	var total := 0.0
	var n := 0
	for s in App.subjects():
		total += App.subject_fraction(s)
		n += 1
	var overall := UI.hbox(10)
	overall.add_child(UI.label("Overall", 13, UI.MUTED, UI.f_semi))
	var b := UI.bar(total / maxf(1, n), UI.ACCENT, 6)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	overall.add_child(b)
	overall.add_child(UI.label("%d%%" % int(round(total / maxf(1, n) * 100)), 13, UI.TEXT2, UI.f_mono))
	col.add_child(UI.spacer(0, 2))
	col.add_child(overall)


func _continue_card(key: String) -> void:
	var parts := key.split(":")
	if parts.size() != 2:
		return
	var info := App.find_chapter(parts[0], int(parts[1]))
	if info.is_empty():
		return
	var s: Dictionary = info.subject
	var color := UI.subject_color(s.key)
	var c := TapCard.new(16, UI.CARD, 18, Color(color, 0.45))
	c.name = "ContinueCard"
	var b := UI.box(c)
	b.add_child(UI.eyebrow("Continue", color))
	var row := UI.hbox(12)
	row.add_child(UI.badge(UI.SUBJECT_ICON.get(s.key, "read"), color, 44))
	var t := UI.vbox(2)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label("%d. %s" % [int(info.chapter.no), info.chapter.title], 17, UI.TEXT, UI.f_bold, true))
	var ch := App.chap(key)
	var tab_name: String = {"listen": "Listen", "read": "Read", "holo": "Hologram", "summary": "Summary"}.get(ch.get("tab", "listen"), "Listen")
	t.add_child(UI.label("%s · Class %s · %s" % [s.name, info.cls.cls, tab_name], 13, UI.MUTED))
	row.add_child(t)
	var go := UI.btn("Resume", "primary", "play", color)
	go.name = "ResumeBtn"
	go.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	go.pressed.connect(_resume.bind(parts[0], int(parts[1]), str(ch.get("tab", "listen"))))
	row.add_child(go)
	b.add_child(row)
	b.add_child(UI.bar(App.chapter_fraction(key), color, 5))
	c.tapped.connect(_resume.bind(parts[0], int(parts[1]), str(ch.get("tab", "listen"))))
	col.add_child(c)


func _resume(pack: String, no: int, tab: String) -> void:
	App.push(LessonScreen.new(pack, no, tab))


func _subject_card(s: Dictionary) -> Control:
	var color := UI.subject_color(s.key)
	var c := TapCard.new(16, UI.CARD, 18)
	c.name = "Subject_" + s.key
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var b := UI.box(c)
	var row := UI.hbox(12)
	row.add_child(UI.badge(UI.SUBJECT_ICON.get(s.key, "read"), color, 44))
	var t := UI.vbox(2)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label(s.name, 18, UI.TEXT, UI.f_bold))
	var chapters := 0
	var holos := 0
	for cl in s.classes:
		chapters += cl.chapters.size()
		for ch in cl.chapters:
			holos += ch.get("holograms", []).size()
	t.add_child(UI.label("Class 11 & 12 · %d chapters · %d holograms" % [chapters, holos], 13, UI.MUTED, null, true))
	row.add_child(t)
	row.add_child(UI.icon_rect("chev", 20, UI.MUTED))
	b.add_child(row)
	var f := App.subject_fraction(s)
	var prow := UI.hbox(10)
	var pb := UI.bar(f, color, 6)
	pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	prow.add_child(pb)
	prow.add_child(UI.label("%d%%" % int(round(f * 100)), 13, UI.TEXT2, UI.f_mono))
	b.add_child(prow)
	c.tapped.connect(func() -> void: App.push(SubjectScreen.new(s.key)))
	return c


func _link_card(node_name: String, icon_name: String, color: Color, title: String, sub: String, cb: Callable) -> Control:
	var c := TapCard.new(16, UI.CARD, 18)
	c.name = node_name
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var row := UI.hbox(12)
	row.add_child(UI.badge(icon_name, color, 44))
	var t := UI.vbox(2)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label(title, 17, UI.TEXT, UI.f_bold))
	t.add_child(UI.label(sub, 13, UI.MUTED, null, true))
	row.add_child(t)
	row.add_child(UI.icon_rect("chev", 20, UI.MUTED))
	UI.box(c).add_child(row)
	c.tapped.connect(cb)
	return c


# ───────── search: chapter titles, section titles and holograms ─────────

func _open_search() -> void:
	var box := UI.vbox(10)
	var field := LineEdit.new()
	field.name = "SearchField"
	field.placeholder_text = "Search chapters, sections, holograms…"
	field.clear_button_enabled = true
	field.custom_minimum_size.y = 46
	box.add_child(field)
	var results := UI.vbox(6)
	results.name = "Results"
	box.add_child(results)
	App.main.open_sheet("Search", box)
	await App.load_holo_index()
	field.text_changed.connect(_search.bind(results))
	field.grab_focus()
	_search("", results)


func _search(q: String, results: VBoxContainer) -> void:
	UI.clear(results)
	q = q.strip_edges().to_lower()
	if q.length() < 2:
		results.add_child(UI.label("Type a topic: \"nephron\", \"vectors\", \"benzene\"…", 13, UI.MUTED, null, true))
		return
	var shown := 0
	for s in App.subjects():
		for cl in s.classes:
			for ch in cl.chapters:
				if q in str(ch.title).to_lower():
					results.add_child(_result("read", UI.subject_color(s.key), "%d. %s" % [int(ch.no), ch.title], "%s · Class %s · chapter" % [s.name, cl.cls], func() -> void:
						App.main.close_sheet()
						App.push(LessonScreen.new(cl.pack, int(ch.no), "listen"))))
					shown += 1
	for f in App.holo_index:
		var hay := ("%s %s %s %s" % [f.title, f.get("fig", ""), f.get("ch", ""), f.get("desc", "")]).to_lower()
		if q in hay:
			var sub_key: String = UI.HOLO_SUB.get(f.sub, "physics")
			results.add_child(_result("holo", UI.subject_color(sub_key), f.title, "%s · %s · hologram" % [f.get("fig", ""), f.get("ch", "")], func() -> void:
				App.main.close_sheet()
				App.push(HoloScreen.new(f.id, 0))))
			shown += 1
			if shown > 60:
				break
	if shown == 0:
		results.add_child(UI.label("Nothing matches \"%s\" in titles. Open a chapter and use Read to look inside it." % q, 13, UI.MUTED, null, true))


func _result(icon_name: String, color: Color, title: String, sub: String, cb: Callable) -> Control:
	var c := TapCard.new(12, UI.CARD, 12)
	var row := UI.hbox(10)
	row.add_child(UI.badge(icon_name, color, 34))
	var t := UI.vbox(0)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label(title, 15, UI.TEXT, UI.f_semi, true))
	t.add_child(UI.label(sub, 12, UI.MUTED, null, true))
	row.add_child(t)
	UI.box(c).add_child(row)
	c.tapped.connect(cb)
	return c

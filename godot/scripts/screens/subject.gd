class_name SubjectScreen
extends Screen
## A subject: Class 11 / Class 12 switch and the chapter list. A chapter opens a sheet: Listen, Read,
## Summary, and the chapter's holograms.

var key := ""
var s := {}
var cls_idx := 0
var list: VBoxContainer
var _switch: HBoxContainer


func _init(subject_key: String) -> void:
	key = subject_key


func _ready() -> void:
	name = "Subject"
	s = App.subject(key)
	build(s.get("name", "Subject"), "")
	# open on the class studied last
	var last: String = App.data.get("last", "")
	for i in s.get("classes", []).size():
		if last.begins_with(s.classes[i].pack + ":"):
			cls_idx = i
	var col := UI.vbox(12)
	_switch = UI.hbox(8)
	col.add_child(_switch)
	list = UI.vbox(10)
	col.add_child(list)
	body.add_child(UI.scroller(UI.pad(col, 16, 14, 16, 28)))
	render()


func on_resume() -> void:
	render()


func render() -> void:
	var color := UI.subject_color(key)
	UI.clear(_switch)
	for i in s.classes.size():
		var b := UI.btn("Class " + str(s.classes[i].cls), "chip_on" if i == cls_idx else "chip", "", color)
		b.name = "Class" + str(s.classes[i].cls)
		b.pressed.connect(func() -> void:
			cls_idx = i
			render())
		_switch.add_child(b)
	UI.clear(list)
	var cl: Dictionary = s.classes[cls_idx]
	set_titles(s.name, "Class %s · %d chapters" % [cl.cls, cl.chapters.size()])
	for ch in cl.chapters:
		list.add_child(_chapter_card(cl, ch, color))


func _chapter_card(cl: Dictionary, ch: Dictionary, color: Color) -> Control:
	var k := App.chapter_key(cl.pack, int(ch.no))
	var c := TapCard.new(14, UI.CARD, 16)
	c.name = "Chapter%d" % int(ch.no)
	var row := UI.hbox(12)
	var num := PanelContainer.new()
	num.add_theme_stylebox_override("panel", UI.sb(Color(color, 0.14), 10, Color(color, 0.35), 1, Vector4()))
	num.custom_minimum_size = Vector2(40, 40)
	var nl := UI.label(str(int(ch.no)), 15, color, UI.f_mono)
	nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	num.add_child(nl)
	num.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(num)
	var t := UI.vbox(3)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label(ch.title, 16, UI.TEXT, UI.f_semi, true))
	var holos: int = ch.get("holograms", []).size()
	var meta := "%s · %s" % [UI.plural(int(ch.get("pages", 0)), "page"), UI.plural(int(ch.get("sections", 0)), "section")]
	if holos > 0:
		meta += " · " + UI.plural(holos, "hologram")
	t.add_child(UI.label(meta, 12, UI.MUTED))
	var f := App.chapter_fraction(k)
	if App.data.chapters.has(k):
		var prow := UI.hbox(8)
		var pb := UI.bar(f, color, 4)
		pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		prow.add_child(pb)
		var heard := App.heard_count(k)
		prow.add_child(UI.label("%d heard" % heard, 11, UI.MUTED, UI.f_mono))
		t.add_child(prow)
	row.add_child(t)
	row.add_child(UI.icon_rect("chev", 18, UI.MUTED))
	UI.box(c).add_child(row)
	c.tapped.connect(_chapter_sheet.bind(cl, ch))
	return c


func _chapter_sheet(cl: Dictionary, ch: Dictionary) -> void:
	var color := UI.subject_color(key)
	var box := UI.vbox(12)
	box.name = "ChapterSheet"
	box.add_child(UI.label("%s · Class %s · %s · %s" % [s.name, cl.cls, UI.plural(int(ch.get("pages", 0)), "page"), UI.plural(int(ch.get("words", 0)), "word")], 13, UI.MUTED, null, true))
	box.add_child(UI.eyebrow("Study this chapter"))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for a in [["listen", "Listen", "Voice notes, word by word"], ["read", "Read", "Page by page"], ["summary", "Summary", "Key points & recall quiz"], ["holo", "Hologram", "The chapter's 3-D figures"]]:
		var tc := TapCard.new(12, UI.CARD2, 14)
		tc.name = "Act_" + a[0]
		tc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var r := UI.hbox(10)
		r.add_child(UI.badge(a[0], color, 36))
		var tv := UI.vbox(0)
		tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tv.add_child(UI.label(a[1], 15, UI.TEXT, UI.f_bold))
		tv.add_child(UI.label(a[2], 12, UI.MUTED, null, true))
		r.add_child(tv)
		UI.box(tc).add_child(r)
		tc.tapped.connect(_open.bind(cl.pack, int(ch.no), a[0]))
		grid.add_child(tc)
	box.add_child(grid)
	var holos: Array = ch.get("holograms", [])
	if not holos.is_empty():
		box.add_child(UI.eyebrow("Holograms"))
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 8)
		flow.add_theme_constant_override("v_separation", 8)
		for h in holos:
			var b := UI.btn(h.title, "chip", "holo", color)
			b.pressed.connect(func() -> void:
				App.main.close_sheet()
				App.push(HoloScreen.new(h.hash, 0)))
			flow.add_child(b)
		box.add_child(flow)
	App.main.open_sheet("%d. %s" % [int(ch.no), ch.title], box)


func _open(pack: String, no: int, tab: String) -> void:
	App.main.close_sheet()
	App.push(LessonScreen.new(pack, no, tab))

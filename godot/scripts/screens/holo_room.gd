class_name HoloRoomScreen
extends Screen
## Hologram Room: all 124 NCERT figures by subject and class, with a search box.

var _sub := "all"
var _cls := 0
var _query := ""
var _list: VBoxContainer
var _filters: HFlowContainer
var _count: Label


func _ready() -> void:
	name = "HoloRoom"
	build("Hologram Room", "Loading…")
	var col := UI.vbox(12)
	var search := LineEdit.new()
	search.name = "Search"
	search.placeholder_text = "Search figures — nephron, benzene, lens…"
	search.clear_button_enabled = true
	search.custom_minimum_size.y = 44
	search.text_changed.connect(func(t: String) -> void:
		_query = t.strip_edges().to_lower()
		_render())
	col.add_child(search)
	_filters = HFlowContainer.new()
	_filters.add_theme_constant_override("h_separation", 6)
	_filters.add_theme_constant_override("v_separation", 6)
	col.add_child(_filters)
	_count = UI.label("", 12, UI.MUTED, UI.f_mono)
	col.add_child(_count)
	_list = UI.vbox(8)
	_list.name = "Figures"
	col.add_child(_list)
	body.add_child(UI.scroller(UI.pad(col, 16, 14, 16, 28)))
	await App.load_holo_index()
	_render()


func _render() -> void:
	UI.clear(_filters)
	for f in [["all", "All"], ["bio", "Biology"], ["chem", "Chemistry"], ["phy", "Physics"]]:
		var color := UI.ACCENT if f[0] == "all" else UI.subject_color(UI.HOLO_SUB[f[0]])
		var b := UI.btn(f[1], "chip_on" if _sub == f[0] else "chip", "", color)
		b.name = "Sub_" + f[0]
		b.pressed.connect(func() -> void:
			_sub = f[0]
			_render())
		_filters.add_child(b)
	for c in [[0, "11 & 12"], [11, "Class 11"], [12, "Class 12"]]:
		var b := UI.btn(c[1], "chip_on" if _cls == c[0] else "chip")
		b.pressed.connect(func() -> void:
			_cls = c[0]
			_render())
		_filters.add_child(b)
	UI.clear(_list)
	var shown := 0
	var last_unit := ""
	for f in App.holo_index:
		if _sub != "all" and f.sub != _sub:
			continue
		if _cls != 0 and int(f.cls) != _cls:
			continue
		if _query != "" and not _query in ("%s %s %s %s" % [f.title, f.get("fig", ""), f.get("ch", ""), f.get("desc", "")]).to_lower():
			continue
		var unit := "%s · Class %d" % [UI.HOLO_SUB.get(f.sub, "").capitalize(), int(f.cls)]
		if str(f.get("ch", "")) != "":
			unit += " · " + str(f.ch)
		if unit != last_unit:
			last_unit = unit
			var e := UI.eyebrow(unit, UI.subject_color(UI.HOLO_SUB.get(f.sub, "physics")))
			e.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			_list.add_child(UI.pad(e, 2, 10, 2, 0))
		_list.add_child(_card(f))
		shown += 1
	_count.text = "%d figures" % shown
	set_titles("Hologram Room", "%d NCERT diagrams in 3-D" % App.holo_index.size())
	if shown == 0:
		_list.add_child(UI.label("No figure matches. Try a shorter word.", 14, UI.MUTED))


func _card(f: Dictionary) -> Control:
	var color := UI.subject_color(UI.HOLO_SUB.get(f.sub, "physics"))
	var c := TapCard.new(12, UI.CARD, 14)
	c.name = "Fig_" + str(f.id)
	var row := UI.hbox(12)
	row.add_child(UI.badge("holo", color, 38))
	var t := UI.vbox(1)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label(str(f.title), 15, UI.TEXT, UI.f_semi, true))
	var meta := "%s · %s" % [f.get("fig", ""), UI.plural(f.variants.size(), "view")]
	var slider := false
	for v in f.variants:
		if str(v.get("slider", "")) != "":
			slider = true
	if slider:
		meta += " · moves"
	if App.data.holos.has(f.id):
		meta += " · seen"
	t.add_child(UI.label(meta, 12, UI.MUTED))
	row.add_child(t)
	row.add_child(UI.icon_rect("chev", 18, UI.MUTED))
	UI.box(c).add_child(row)
	c.tapped.connect(func() -> void: App.push(HoloScreen.new(f.id, 0)))
	return c

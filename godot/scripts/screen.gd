class_name Screen
extends Control
## A full-screen page: an app bar (Back · title + subtitle · actions) above the page body.

var bar: PanelContainer
var back_btn: Button
var title_l: Label
var sub_l: Label
var actions: HBoxContainer
var body: VBoxContainer


func build(title: String, sub := "", show_back := true) -> void:
	var col := UI.vbox(0)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(col)
	bar = PanelContainer.new()
	var st := UI.sb(UI.PANEL, 0, UI.BORDER, 0, Vector4(6, 6, 8, 6))
	st.border_width_bottom = 1
	bar.add_theme_stylebox_override("panel", st)
	bar.custom_minimum_size.y = 58
	var row := UI.hbox(4)
	back_btn = UI.icon_btn("back", "Back", 46)
	back_btn.name = "Back"
	back_btn.pressed.connect(App.back)
	back_btn.visible = show_back
	row.add_child(back_btn)
	if not show_back:
		row.add_child(UI.spacer(10))
		row.get_child(-1).size_flags_horizontal = Control.SIZE_FILL
	var titles := UI.vbox(0)
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.alignment = BoxContainer.ALIGNMENT_CENTER
	title_l = UI.line(title, 17, UI.TEXT, UI.f_bold)
	sub_l = UI.line(sub, 12, UI.MUTED, UI.f_med)
	sub_l.visible = sub != ""
	titles.add_child(title_l)
	titles.add_child(sub_l)
	row.add_child(titles)
	actions = UI.hbox(2)
	row.add_child(actions)
	bar.add_child(row)
	col.add_child(bar)
	body = UI.vbox(0)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(body)


func set_titles(title: String, sub := "") -> void:
	title_l.text = title
	sub_l.text = sub
	sub_l.visible = sub != ""


func add_action(icon_name: String, tip: String, cb: Callable, node_name := "") -> Button:
	var b := UI.icon_btn(icon_name, tip, 46)
	if node_name != "":
		b.name = node_name
	b.pressed.connect(cb)
	actions.add_child(b)
	return b


func main() -> Node:
	return App.main

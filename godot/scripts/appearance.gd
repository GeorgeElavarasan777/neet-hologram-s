class_name Appearance
extends RefCounted
## The Appearance sheet: theme (Calm · Calm night · Hologram), each shown as a small page in its own
## colours, and the text size. A change rebuilds the pages in the new look.

const ABOUT := {
	"calm": "Cool paper, blue-black ink — easy on the eyes for long sessions",
	"calm_night": "The same notebook in deep slate for evening study",
	"hologram": "The original dark look with bright cyan",
}


static func open() -> void:
	var box := UI.vbox(12)
	box.name = "Appearance"
	box.add_child(UI.eyebrow("Theme"))
	for name in ["calm", "calm_night", "hologram"]:
		box.add_child(_theme_card(name))
	box.add_child(UI.eyebrow("Text size"))
	var sizes := HFlowContainer.new()
	sizes.add_theme_constant_override("h_separation", 8)
	sizes.add_theme_constant_override("v_separation", 8)
	for z in [[0.9, "Small"], [1.0, "Normal"], [1.12, "Large"], [1.25, "Larger"]]:
		var b := UI.btn(z[1], "chip_on" if is_equal_approx(float(App.setting("text_size", 1.0)), z[0]) else "chip")
		b.name = "Size_" + str(z[1])
		b.pressed.connect(func() -> void:
			App.set_setting("text_size", z[0])
			App.main.close_sheet()
			App.main.restyle())
		sizes.add_child(b)
	box.add_child(sizes)
	App.main.open_sheet("Appearance", box, 520)


static func _theme_card(name: String) -> Control:
	var p: Dictionary = UI.PALETTES[name]
	var on: bool = str(App.setting("theme", "calm")) == name
	var c := TapCard.new(12, UI.CARD, 14, UI.ACCENT if on else UI.BORDER)
	c.name = "Theme_" + name
	var row := UI.hbox(14)
	# a little page in that theme's colours: paper, the margin rule, ink and the action colour
	var page := PanelContainer.new()
	page.custom_minimum_size = Vector2(74, 56)
	page.add_theme_stylebox_override("panel", UI.sb(Color(p.bg), 10, Color(p.border2), 1, Vector4(0, 0, 0, 0)))
	page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var inner := UI.hbox(0)
	inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(UI.spacer(14))
	inner.get_child(0).size_flags_horizontal = Control.SIZE_FILL
	var rule := ColorRect.new()
	rule.color = Color(p.margin)
	rule.custom_minimum_size = Vector2(2, 0)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(rule)
	var col := UI.vbox(4)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var aa := UI.label("Aa", 20, Color(p.text), UI.f_serif_semi)
	aa.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(aa)
	var dot := PanelContainer.new()
	dot.custom_minimum_size = Vector2(22, 5)
	dot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	dot.add_theme_stylebox_override("panel", UI.sb(Color(p.accent), 3, Color(0, 0, 0, 0), 0, Vector4()))
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(dot)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.add_child(col)
	page.add_child(inner)
	row.add_child(page)
	var t := UI.vbox(2)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.alignment = BoxContainer.ALIGNMENT_CENTER
	t.add_child(UI.label(UI.PALETTE_NAMES[name], 16, UI.TEXT, UI.f_bold))
	t.add_child(UI.label(ABOUT[name], 13, UI.MUTED, null, true))
	row.add_child(t)
	if on:
		row.add_child(UI.icon_rect("check", 20, UI.ACCENT))
	UI.box(c).add_child(row)
	c.tapped.connect(func() -> void:
		App.set_setting("theme", name)
		App.main.close_sheet()
		App.main.restyle())
	return c

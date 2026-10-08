class_name HoloScreen
extends Screen
## One hologram, full screen: views (variants), the take-apart / motion slider, labels on/off, a label
## quiz, and the figure's notes (ⓘ).

var fig_id := ""
var vi := 0
var fig := {}
var view: HoloView
var _controls: VBoxContainer
var _variants: HFlowContainer
var _slider_row: HBoxContainer
var _slider: HSlider
var _slider_l: Label
var _status: Label
var _labels_btn: Button
var _quiz_btn: Button
var _color := UI.ACCENT


func _init(id: String, variant := 0) -> void:
	fig_id = id
	vi = variant


func _ready() -> void:
	name = "Holo"
	build("Hologram", "")
	add_action("info", "About this figure", _info, "InfoBtn")
	var col := UI.vbox(0)
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	view = HoloView.new()
	view.name = "Stage"
	view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	view.loaded.connect(_on_loaded)
	view.label_tapped.connect(_on_label)
	col.add_child(view)
	_status = UI.label("Projecting…", 14, UI.MUTED)
	_status.set_anchors_preset(Control.PRESET_CENTER)
	view.add_child(_status)
	# controls under the stage
	var panel := PanelContainer.new()
	var st := UI.sb(UI.PANEL, 0, UI.BORDER, 0, Vector4(12, 10, 12, 12))
	st.border_width_top = 1
	panel.add_theme_stylebox_override("panel", st)
	_controls = UI.vbox(10)
	_variants = HFlowContainer.new()
	_variants.name = "Variants"
	_variants.add_theme_constant_override("h_separation", 6)
	_variants.add_theme_constant_override("v_separation", 6)
	_controls.add_child(_variants)
	_slider_row = UI.hbox(10)
	_slider_row.name = "SliderRow"
	_slider_l = UI.label("Explode", 12, UI.TEXT2, UI.f_semi)
	_slider_l.custom_minimum_size.x = 90
	_slider_row.add_child(_slider_l)
	_slider = HSlider.new()
	_slider.name = "Slider"
	_slider.min_value = 0
	_slider.max_value = 1
	_slider.step = 0.001
	_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_slider.custom_minimum_size.y = 32
	_slider.value_changed.connect(func(v: float) -> void: view.set_slider(v))
	_slider_row.add_child(_slider)
	_controls.add_child(_slider_row)
	var tools := UI.hbox(8)
	_labels_btn = UI.btn("Labels", "chip_on", "tag")
	_labels_btn.name = "LabelsBtn"
	_labels_btn.pressed.connect(_toggle_labels)
	tools.add_child(_labels_btn)
	_quiz_btn = UI.btn("Label quiz", "chip", "quiz")
	_quiz_btn.name = "QuizBtn"
	_quiz_btn.pressed.connect(_toggle_quiz)
	tools.add_child(_quiz_btn)
	tools.add_child(UI.spacer())
	var reset := UI.btn("Reset", "chip", "target")
	reset.name = "ResetBtn"
	reset.pressed.connect(func() -> void:
		view.reset_view()
		_slider.value = 0)
	tools.add_child(reset)
	_controls.add_child(tools)
	panel.add_child(_controls)
	col.add_child(panel)
	body.add_child(col)
	await App.load_holo_index()
	fig = App.holo_by_id.get(fig_id, {})
	if fig.is_empty():
		_status.text = "This hologram was not found."
		return
	_color = UI.subject_color(UI.HOLO_SUB.get(fig.sub, "physics"))
	set_titles(fig.title, "%s · %s" % [fig.get("fig", ""), fig.get("ch", "")])
	App.mark_holo(fig_id)
	_render_variants()
	_load()


func on_hide() -> void:
	if view:
		view.pause_render(true)


func on_resume() -> void:
	if view:
		view.pause_render(false)


func _load() -> void:
	_status.visible = true
	_status.text = "Projecting…"
	_slider_row.visible = false
	view.load_figure(fig, vi)


func _on_loaded(ok: bool) -> void:
	_status.visible = not ok
	if not ok:
		_status.text = "The model could not be loaded."
		return
	var v: Dictionary = fig.variants[vi]
	_slider_row.visible = view.has_slider()
	_slider_l.text = str(v.get("slider", "Explode")) if str(v.get("slider", "")) != "" else "Explode"
	_slider.set_value_no_signal(0)
	view.set_labels(bool(App.setting("labels", true)))
	UI.style_btn(_labels_btn, "chip_on" if view.labels_on else "chip")
	view.set_quiz(false)
	UI.style_btn(_quiz_btn, "chip")


func _render_variants() -> void:
	UI.clear(_variants)
	_variants.visible = fig.variants.size() > 1
	for i in fig.variants.size():
		var b := UI.btn(str(fig.variants[i].name), "chip_on" if i == vi else "chip", "", _color)
		b.name = "View%d" % i
		b.pressed.connect(func() -> void:
			vi = i
			_render_variants()
			_load())
		_variants.add_child(b)


func _toggle_labels() -> void:
	view.set_labels(not view.labels_on)
	App.set_setting("labels", view.labels_on)
	UI.style_btn(_labels_btn, "chip_on" if view.labels_on else "chip")


func _toggle_quiz() -> void:
	view.set_quiz(not view.quiz)
	if view.quiz and not view.labels_on:
		view.set_labels(true)
		UI.style_btn(_labels_btn, "chip_on")
	UI.style_btn(_quiz_btn, "chip_on" if view.quiz else "chip", UI.WARN)
	if view.quiz:
		App.toast("Name each numbered part, then tap it to check")


func _on_label(i: int) -> void:
	var labels: Array = fig.variants[vi].labels
	if i < 0 or i >= labels.size():
		return
	var lb: Dictionary = labels[i]
	if view.quiz and not view.revealed.has(i):
		view.reveal(i)
	var box := UI.vbox(10)
	box.name = "LabelCard"
	var note := str(lb.get("n", ""))
	box.add_child(UI.label(note if note != "" else "Part of %s." % fig.title, 16, UI.TEXT, null, true))
	App.main.open_sheet(str(lb.t), box, 480)


func _info() -> void:
	if fig.is_empty():
		return
	var box := UI.vbox(10)
	box.name = "FigInfo"
	box.add_child(UI.label("%s · %s · %s" % [fig.get("fig", ""), fig.get("ch", ""), fig.get("unit", "")], 12, UI.MUTED, null, true))
	box.add_child(UI.label(str(fig.get("desc", "")), 15, UI.TEXT, null, true))
	var pts: Array = fig.get("points", [])
	if not pts.is_empty():
		box.add_child(UI.eyebrow("Remember", _color))
		for p in pts:
			var row := UI.hbox(8)
			row.add_child(UI.label("•", 15, _color, UI.f_bold))
			var t := UI.label(str(p), 14, UI.TEXT2, null, true)
			t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(t)
			box.add_child(row)
	var labels: Array = fig.variants[vi].labels
	if not labels.is_empty():
		box.add_child(UI.eyebrow("Labelled parts", _color))
		for lb in labels:
			box.add_child(UI.label("%s — %s" % [lb.t, lb.get("n", "")], 13, UI.TEXT2, null, true))
	App.main.open_sheet(fig.title, box, 620)

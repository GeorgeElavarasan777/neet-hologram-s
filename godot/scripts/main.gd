extends Control
## Root: a stack of full-screen pages (Home → Subject → Lesson …), bottom sheets, toasts, and the UI scale
## (CSS-pixel sized on the web: content_scale_factor follows the device pixel ratio).

var host: Control
var overlay: Control
var stack: Array[Control] = []
var _sheet: Control
var _toast: PanelContainer
var _toast_tween: Tween
var _scale := 1.0


func _ready() -> void:
	App.main = self
	_apply_scale()
	get_viewport().size_changed.connect(_on_resize)
	var bg := ColorRect.new()
	bg.color = UI.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	host = Control.new()
	host.set_anchors_preset(Control.PRESET_FULL_RECT)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(host)
	overlay = Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(overlay)
	var loading := UI.label("Loading HoloStudy…", 15, UI.MUTED)
	loading.set_anchors_preset(Control.PRESET_CENTER)
	add_child(loading)
	await App.boot()
	loading.queue_free()
	push(HomeScreen.new())
	if App.autotest:
		var t := AutoTest.new()
		add_child(t)


func _apply_scale() -> void:
	var s := DisplayServer.screen_get_scale() if OS.has_feature("web") else 1.0
	if OS.has_feature("web") or OS.has_feature("mobile"):
		s = maxf(1.0, s)
	s *= float(App.setting("text_size", 1.0))
	if absf(s - _scale) > 0.01 or UI.theme == null:
		_scale = s
		get_window().content_scale_factor = s
		theme = UI.setup(s)
		get_window().theme = theme


func _on_resize() -> void:
	_apply_scale()
	for s in stack:
		if s.has_method("on_resize"):
			s.on_resize()


## the window in UI pixels
func ui_size() -> Vector2:
	return size


func is_landscape_phone() -> bool:
	return size.x > size.y and size.y < 560


func is_wide() -> bool:
	return size.x >= 820


func depth() -> int:
	return stack.size()


func push(screen: Control) -> void:
	if not stack.is_empty():
		var prev: Control = stack.back()
		if prev.has_method("on_hide"):
			prev.on_hide()
		prev.visible = false
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	host.add_child(screen)
	stack.append(screen)
	screen.modulate.a = 0.0
	screen.position.x = 24
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(screen, "modulate:a", 1.0, 0.18)
	tw.tween_property(screen, "position:x", 0.0, 0.22)


## Back: close a sheet, let the page handle it (e.g. leave a game), else go to the previous page
func back() -> void:
	if _sheet:
		_hide_sheet()
		return
	if stack.is_empty():
		return
	var top: Control = stack.back()
	if top.has_method("on_back") and top.on_back():
		return
	if stack.size() <= 1:
		return
	stack.pop_back()
	if top.has_method("on_hide"):
		top.on_hide()
	host.remove_child(top)
	top.queue_free()
	var prev: Control = stack.back()
	prev.visible = true
	prev.position.x = 0
	if prev.has_method("on_resume"):
		prev.on_resume()


func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		App.back()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		App.back()


# ───────── bottom sheets (a centred dialog on wide screens) ─────────

func open_sheet(title: String, content: Control, max_w := 560.0) -> Control:
	if _sheet:
		_close_now()
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	var scrim := ColorRect.new()
	scrim.color = Color(0, 0, 0, 0.55)
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	scrim.gui_input.connect(_on_scrim_input)
	root.add_child(scrim)
	var panel := PanelContainer.new()
	var wide := is_wide() or is_landscape_phone()
	var st := UI.sb(UI.PANEL, 20, UI.BORDER2, 1, Vector4(18, 14, 18, 18))
	if not wide:
		st.corner_radius_bottom_left = 0
		st.corner_radius_bottom_right = 0
	panel.add_theme_stylebox_override("panel", st)
	var col := UI.vbox(10)
	var head := UI.hbox(8)
	var t := UI.line(title, 17, UI.TEXT, UI.f_bold)
	head.add_child(t)
	var x := UI.icon_btn("close", "Close", 40)
	x.name = "SheetClose"
	x.pressed.connect(App.back)
	head.add_child(x)
	col.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.scroll_deadzone = 10
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(content)
	col.add_child(scroll)
	panel.add_child(col)
	root.add_child(panel)
	overlay.add_child(root)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_sheet = root
	_layout_sheet(panel, scroll, content, max_w, wide)
	content.resized.connect(_layout_sheet.bind(panel, scroll, content, max_w, wide))
	panel.modulate.a = 0.0
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(panel, "modulate:a", 1.0, 0.16)
	if not wide:
		var y := panel.position.y
		panel.position.y = y + 40
		tw.tween_property(panel, "position:y", y, 0.22)
	if OS.has_feature("web") and not App.autotest:
		JavaScriptBridge.eval("history.pushState({hs: Date.now()}, '')")
	return root


func _on_scrim_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton and ev.pressed:
		App.back()


func _layout_sheet(panel: PanelContainer, scroll: ScrollContainer, content: Control, max_w: float, wide: bool) -> void:
	if not is_instance_valid(panel) or not is_instance_valid(content):
		return
	var w := minf(size.x - (32 if wide else 0), max_w)
	var want := content.get_combined_minimum_size().y + 80
	var h := minf(want, size.y * (0.86 if wide else 0.82))
	scroll.custom_minimum_size.y = h - 80
	panel.size = Vector2(w, h)
	panel.position = Vector2((size.x - w) * 0.5, (size.y - h) * 0.5 if wide else size.y - h)


func has_sheet() -> bool:
	return _sheet != null


## close from code (a choice was made in the sheet); the browser history entry it added goes too
func close_sheet() -> void:
	if not _sheet:
		return
	if OS.has_feature("web") and not App.autotest:
		App.skip_pop += 1
		JavaScriptBridge.eval("history.back()")
	_hide_sheet()


func _hide_sheet() -> void:
	if not _sheet:
		return
	var s := _sheet
	_sheet = null
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.remove_child(s)
	s.queue_free()


func _close_now() -> void:
	if _sheet:
		overlay.remove_child(_sheet)
		_sheet.queue_free()
		_sheet = null
		overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE


# ───────── toast ─────────

func toast(text: String, seconds := 2.6) -> void:
	if _toast:
		_toast.queue_free()
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UI.sb(Color("#0f1a2e"), 999, UI.ACCENT, 1, Vector4(16, 9, 16, 9)))
	var l := UI.label(text, 14, UI.TEXT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(p)
	_toast = p
	await get_tree().process_frame
	if not is_instance_valid(p):
		return
	var w := minf(p.get_combined_minimum_size().x, size.x - 32)
	p.size = Vector2(w, 0)
	var bottom := 96.0 if not is_landscape_phone() else 20.0
	p.position = Vector2((size.x - w) * 0.5, size.y - bottom - p.size.y)
	p.modulate.a = 0.0
	if _toast_tween:
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_property(p, "modulate:a", 1.0, 0.18)
	_toast_tween.tween_interval(seconds)
	_toast_tween.tween_property(p, "modulate:a", 0.0, 0.25)
	_toast_tween.tween_callback(p.queue_free)

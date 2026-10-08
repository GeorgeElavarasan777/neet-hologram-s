class_name TapCard
extends PanelContainer
## A card that works like a button but can hold any layout. A tap only counts when the finger did not
## travel (so scrolling a list never opens what was under the finger).

signal tapped

var _down := false
var _from := Vector2.ZERO
var _moved := false
var _normal: StyleBoxFlat
var _hover: StyleBoxFlat
var _pressed: StyleBoxFlat


func _init(pad := 16, bg := UI.CARD, radius := 16, border := UI.BORDER) -> void:
	var p := Vector4(pad, pad, pad, pad)
	_normal = UI.sb(bg, radius, border, 1, p)
	_hover = UI.sb(bg.lightened(0.035), radius, UI.BORDER2, 1, p)
	_pressed = UI.sb(bg.lightened(0.07), radius, UI.ACCENT.darkened(0.3), 1, p)
	add_theme_stylebox_override("panel", _normal)
	mouse_filter = Control.MOUSE_FILTER_PASS
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var box := VBoxContainer.new()
	box.name = "Box"
	box.add_theme_constant_override("separation", 8)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(box)
	mouse_entered.connect(_hover_on.bind(true))
	mouse_exited.connect(_hover_on.bind(false))


func _hover_on(on: bool) -> void:
	if not _down:
		add_theme_stylebox_override("panel", _hover if on else _normal)


func set_border(c: Color) -> void:
	_normal.border_color = c


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			_down = true
			_moved = false
			_from = e.global_position
			add_theme_stylebox_override("panel", _pressed)
		elif _down:
			_down = false
			add_theme_stylebox_override("panel", _normal)
			if not _moved and get_global_rect().has_point(e.global_position):
				tapped.emit()
	elif e is InputEventMouseMotion and _down and not _moved:
		if e.global_position.distance_to(_from) > 12:
			_moved = true
			add_theme_stylebox_override("panel", _normal)


## for tests and keyboard: behave as if tapped
func tap() -> void:
	tapped.emit()

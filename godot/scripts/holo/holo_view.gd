class_name HoloView
extends Control
## The 3-D stage: one NCERT hologram (GLB from tools/godot-content.mjs) on a projector, drawn with a
## hologram shader, turned by dragging, zoomed by pinch / wheel, with callout labels that point at the
## parts (tap one to read about it), a quiz mode that hides the names, and the figure's slider
## (take apart / its own motion) driven by the exported "slider" animation.

signal loaded(ok: bool)
signal label_tapped(i: int)

var fig := {}
var variant := {}
var labels_on := true
var quiz := false
var revealed := {}
var model: Node3D
var anim: AnimationPlayer
var _vp: SubViewport
var _view: TextureRect
var _world: Node3D
var _yaw: Node3D
var _pitch: Node3D
var _cam: Camera3D
var _ring: Node3D
var _overlay: Control
var _pills: Array = [] # [{node: Node3D marker, pill: Button, i}]
var _yaw_v := deg_to_rad(-25.0)
var _pitch_v := deg_to_rad(-12.0)
var _dist := 5.6
var _drag := false
var _touches := {}
var _pinch_d := 0.0
var _slider_t := 0.0
var _last_tap := 0
var _px_scale := 1.0

const SHADER_OPAQUE := """
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;
uniform vec4 albedo : source_color = vec4(1.0);
uniform float emit = 0.22;
uniform float rim = 0.55;
varying vec3 wpos;
void vertex() { wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec3 n = FRONT_FACING ? NORMAL : -NORMAL;
	NORMAL = n;
	float f = pow(1.0 - clamp(dot(n, VIEW), 0.0, 1.0), 2.2);
	float scan = 0.94 + 0.06 * sin(wpos.y * 90.0 - TIME * 3.0);
	ALBEDO = albedo.rgb * scan;
	ROUGHNESS = 0.45;
	SPECULAR = 0.35;
	EMISSION = albedo.rgb * emit + mix(albedo.rgb, vec3(0.62, 0.92, 1.0), 0.45) * f * rim;
}
"""
const SHADER_CLEAR := """
shader_type spatial;
render_mode cull_disabled, depth_draw_never, blend_mix;
uniform vec4 albedo : source_color = vec4(1.0);
uniform float emit = 0.3;
uniform float rim = 0.8;
void fragment() {
	vec3 n = FRONT_FACING ? NORMAL : -NORMAL;
	NORMAL = n;
	float f = pow(1.0 - clamp(dot(n, VIEW), 0.0, 1.0), 2.0);
	ALBEDO = albedo.rgb;
	ROUGHNESS = 0.4;
	EMISSION = albedo.rgb * emit + albedo.rgb * f * rim;
	ALPHA = clamp(albedo.a + f * 0.25, 0.0, 1.0);
}
"""
const SHADER_LINE := """
shader_type spatial;
render_mode unshaded, cull_disabled;
uniform vec4 albedo : source_color = vec4(1.0);
void fragment() { ALBEDO = albedo.rgb * 1.15; }
"""
static var _shaders := {}


func _ready() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_PASS
	_vp = SubViewport.new()
	_vp.own_world_3d = true
	_vp.transparent_bg = false
	_vp.msaa_3d = Viewport.MSAA_2X
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_vp)
	_view = TextureRect.new()
	_view.set_anchors_preset(Control.PRESET_FULL_RECT)
	_view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_view.stretch_mode = TextureRect.STRETCH_SCALE
	_view.texture = _vp.get_texture()
	_view.mouse_filter = Control.MOUSE_FILTER_STOP
	_view.gui_input.connect(_on_input)
	add_child(_view)
	_overlay = Control.new()
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.draw.connect(_draw_leaders)
	add_child(_overlay)
	_build_world()
	resized.connect(_fit_viewport)
	_fit_viewport()


func _fit_viewport() -> void:
	_px_scale = clampf(UI.scale, 1.0, 2.0)
	_vp.size = Vector2i(maxi(16, int(size.x * _px_scale)), maxi(16, int(size.y * _px_scale)))


func _build_world() -> void:
	_world = Node3D.new()
	_vp.add_child(_world)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#070b14")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#a9c4e8")
	env.ambient_light_energy = 0.55
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 0.9
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	_world.add_child(we)
	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-40), deg_to_rad(35), 0)
	key.light_energy = 1.0
	_world.add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation = Vector3(deg_to_rad(-15), deg_to_rad(-140), 0)
	fill.light_energy = 0.35
	fill.light_color = Color("#7dd3fc")
	_world.add_child(fill)
	_yaw = Node3D.new()
	_world.add_child(_yaw)
	_pitch = Node3D.new()
	_yaw.add_child(_pitch)
	_cam = Camera3D.new()
	_cam.fov = 38
	_cam.near = 0.05
	_cam.far = 100
	_pitch.add_child(_cam)
	_cam.current = true
	_build_projector()
	_apply_cam()


func _build_projector() -> void:
	var base := Node3D.new()
	base.position.y = -2.15
	_world.add_child(base)
	var disc := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 2.2
	cyl.bottom_radius = 2.35
	cyl.height = 0.12
	cyl.radial_segments = 64
	disc.mesh = cyl
	var dm := StandardMaterial3D.new()
	dm.albedo_color = Color("#0e1a2b")
	dm.metallic = 0.4
	dm.roughness = 0.35
	disc.material_override = dm
	base.add_child(disc)
	var rim := MeshInstance3D.new()
	var tor := TorusMesh.new()
	tor.inner_radius = 2.12
	tor.outer_radius = 2.2
	tor.rings = 64
	rim.mesh = tor
	rim.position.y = 0.07
	var rm := StandardMaterial3D.new()
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rm.albedo_color = Color("#38bdf8")
	rim.material_override = rm
	base.add_child(rim)
	_ring = Node3D.new()
	_ring.position.y = 0.08
	base.add_child(_ring)
	var tick := BoxMesh.new()
	tick.size = Vector3(0.26, 0.012, 0.04)
	var tm := StandardMaterial3D.new()
	tm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	tm.albedo_color = Color("#7dd3fc")
	for i in 24:
		var a := float(i) / 24.0 * TAU
		var m := MeshInstance3D.new()
		m.mesh = tick
		m.material_override = tm
		m.position = Vector3(1.85 * cos(a), 0, 1.85 * sin(a))
		m.rotation.y = -a
		_ring.add_child(m)
	# soft light cone above the projector
	var cone := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 1.9
	cm.bottom_radius = 1.6
	cm.height = 4.2
	cm.radial_segments = 48
	cm.cap_top = false
	cm.cap_bottom = false
	cone.mesh = cm
	cone.position.y = 2.1
	var cmat := StandardMaterial3D.new()
	cmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	cmat.albedo_color = Color(0.3, 0.8, 1.0, 0.035)
	cmat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	cone.material_override = cmat
	base.add_child(cone)


func _process(dt: float) -> void:
	if not is_visible_in_tree():
		return
	if _ring:
		_ring.rotation.y += dt * 0.15
	_place_labels()


# ───────── loading ─────────

func load_figure(f: Dictionary, vi: int) -> void:
	fig = f
	variant = f.variants[clampi(vi, 0, f.variants.size() - 1)]
	revealed.clear()
	if model:
		model.queue_free()
		model = null
		anim = null
	_clear_pills()
	var bytes := await App.fetch_bytes("holo/" + str(variant.file))
	if bytes.is_empty():
		loaded.emit(false)
		return
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	if doc.append_from_buffer(bytes, "", state) != OK:
		loaded.emit(false)
		return
	var scene := doc.generate_scene(state)
	if not scene is Node3D:
		loaded.emit(false)
		return
	model = scene
	_world.add_child(model)
	_restyle(model)
	_add_texts()
	for a in model.find_children("*", "AnimationPlayer", true, false):
		if (a as AnimationPlayer).has_animation("slider"):
			anim = a
	set_slider(0.0)
	_make_pills()
	loaded.emit(true)


## hologram materials: glow + rim from the model's own colours; lines stay crisp and bright
func _restyle(root: Node) -> void:
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		if m.mesh == null:
			continue
		for s in m.mesh.get_surface_count():
			var src := m.mesh.surface_get_material(s)
			var col := Color(0.8, 0.9, 1.0, 1.0)
			if src is BaseMaterial3D:
				col = (src as BaseMaterial3D).albedo_color
			var prim := Mesh.PRIMITIVE_TRIANGLES
			if m.mesh is ArrayMesh:
				prim = (m.mesh as ArrayMesh).surface_get_primitive_type(s)
			var kind := "line" if prim in [Mesh.PRIMITIVE_LINES, Mesh.PRIMITIVE_LINE_STRIP, Mesh.PRIMITIVE_POINTS] else ("clear" if col.a < 0.97 else "opaque")
			var mat := ShaderMaterial.new()
			mat.shader = _shader(kind)
			mat.set_shader_parameter("albedo", col)
			m.set_surface_override_material(s, mat)


static func _shader(kind: String) -> Shader:
	if not _shaders.has(kind):
		var sh := Shader.new()
		sh.code = {"opaque": SHADER_OPAQUE, "clear": SHADER_CLEAR, "line": SHADER_LINE}[kind]
		_shaders[kind] = sh
	return _shaders[kind]


## words written inside the figure (axis names, symbols) — billboards that always face the viewer
func _add_texts() -> void:
	var texts: Array = variant.get("texts", [])
	for i in texts.size():
		var n := model.find_child("txt_%d" % i, true, false)
		if n == null or not n is Node3D:
			continue
		var t: Dictionary = texts[i]
		var l := Label3D.new()
		l.text = str(t.s)
		l.font = UI.f_bold if t.get("bold", false) else UI.f_semi
		l.font_size = 44
		l.outline_size = 10
		l.outline_modulate = Color(0.02, 0.04, 0.08, 0.85)
		l.pixel_size = float(t.get("size", 0.22)) / 64.0
		l.modulate = Color(str(t.get("color", "#e8f4ff")))
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = bool(t.get("top", false))
		l.double_sided = true
		(n as Node3D).add_child(l)


func set_slider(t: float) -> void:
	_slider_t = clampf(t, 0.0, 1.0)
	if anim:
		if anim.current_animation != "slider":
			anim.play("slider")
		anim.seek(_slider_t * anim.get_animation("slider").length, true)
		anim.pause()


func has_slider() -> bool:
	return anim != null


# ───────── camera ─────────

func _apply_cam() -> void:
	_pitch_v = clampf(_pitch_v, deg_to_rad(-80), deg_to_rad(80))
	_dist = clampf(_dist, 2.2, 14.0)
	_yaw.rotation.y = _yaw_v
	_pitch.rotation.x = _pitch_v
	_cam.position = Vector3(0, 0, _dist)


func reset_view() -> void:
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_method(_set_cam.bind(0), _yaw_v, deg_to_rad(-25.0), 0.35)
	tw.tween_method(_set_cam.bind(1), _pitch_v, deg_to_rad(-12.0), 0.35)
	tw.tween_method(_set_cam.bind(2), _dist, 5.6, 0.35)


func _set_cam(v: float, which: int) -> void:
	match which:
		0:
			_yaw_v = v
		1:
			_pitch_v = v
		_:
			_dist = v
	_apply_cam()


func turn(dx: float, dy: float) -> void:
	_yaw_v -= dx * 0.008
	_pitch_v -= dy * 0.006
	_apply_cam()


func zoom(f: float) -> void:
	_dist *= f
	_apply_cam()


func _on_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_touches[e.index] = e.position
		else:
			_touches.erase(e.index)
		_pinch_d = _pinch_distance()
	elif e is InputEventScreenDrag:
		_touches[e.index] = e.position
		if _touches.size() >= 2:
			var d := _pinch_distance()
			if _pinch_d > 0 and d > 0:
				zoom(_pinch_d / d)
			_pinch_d = d
			accept_event()
	elif e is InputEventMouseButton:
		if e.button_index == MOUSE_BUTTON_LEFT:
			_drag = e.pressed
			if e.pressed:
				var now := Time.get_ticks_msec()
				if now - _last_tap < 320:
					reset_view()
				_last_tap = now
		elif e.button_index == MOUSE_BUTTON_WHEEL_UP and e.pressed:
			zoom(0.9)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN and e.pressed:
			zoom(1.1)
	elif e is InputEventMouseMotion and _drag and _touches.size() < 2:
		turn(e.relative.x, e.relative.y)
	elif e is InputEventMagnifyGesture:
		zoom(1.0 / e.factor)
	elif e is InputEventPanGesture:
		turn(e.delta.x * 6, e.delta.y * 6)


func _pinch_distance() -> float:
	if _touches.size() < 2:
		return 0.0
	var p: Array = _touches.values()
	return (p[0] as Vector2).distance_to(p[1])


# ───────── callout labels ─────────

func _clear_pills() -> void:
	for p in _pills:
		_overlay.remove_child(p.pill)
		p.pill.queue_free()
	_pills.clear()


func _make_pills() -> void:
	_clear_pills()
	var list: Array = variant.get("labels", [])
	for i in list.size():
		var n := model.find_child("lbl_%d" % i, true, false)
		if n == null or not n is Node3D:
			continue
		var b := Button.new()
		b.name = "Label%d" % i
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 12)
		b.add_theme_font_override("font", UI.f_semi)
		b.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		b.custom_minimum_size = Vector2(0, 28)
		var pad := Vector4(9, 3, 9, 3)
		UI._btn_styles(b, UI.sb(Color(0.03, 0.07, 0.13, 0.86), 999, Color(UI.ACCENT, 0.55), 1, pad), UI.sb(Color(0.05, 0.12, 0.2, 0.95), 999, UI.ACCENT, 1, pad), UI.sb(Color(0.06, 0.16, 0.26, 0.98), 999, UI.ACCENT, 1, pad))
		b.pressed.connect(_pill_pressed.bind(i))
		_overlay.add_child(b)
		_pills.append({"node": n, "pill": b, "i": i})
	_update_pill_text()


func _update_pill_text() -> void:
	var list: Array = variant.get("labels", [])
	for p in _pills:
		var i: int = p.i
		var show_name: bool = not quiz or revealed.has(i)
		p.pill.text = str(list[i].t) if show_name else str(i + 1)
		p.pill.visible = labels_on
		p.pill.size = Vector2.ZERO


func set_labels(on: bool) -> void:
	labels_on = on
	_update_pill_text()
	_overlay.queue_redraw()


func set_quiz(on: bool) -> void:
	quiz = on
	revealed.clear()
	_update_pill_text()


func reveal(i: int) -> void:
	revealed[i] = true
	_update_pill_text()


func _pill_pressed(i: int) -> void:
	label_tapped.emit(i)


## each label sits beside its point (left or right of it), stacked so none overlap; a thin line joins them
func _place_labels() -> void:
	if not labels_on or _pills.is_empty() or not _cam:
		return
	var w := size.x
	var h := size.y
	var max_w := clampf(w * 0.34, 90, 200)
	var items := []
	for p in _pills:
		var pos: Vector3 = (p.node as Node3D).global_position
		var behind := _cam.is_position_behind(pos)
		var sp := _cam.unproject_position(pos) / _px_scale
		var b: Button = p.pill
		# width from the words themselves (a trimming button reports almost no minimum width)
		var tw := UI.f_semi.get_string_size(b.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 20
		var ms := Vector2(tw, 28)
		var bw := minf(ms.x, max_w)
		var left := sp.x < w * 0.5
		items.append({"p": p, "anchor": sp, "w": bw, "h": ms.y, "left": left, "behind": behind})
	for side in [true, false]:
		var col: Array = items.filter(func(it): return it.left == side)
		col.sort_custom(func(a, b): return a.anchor.y < b.anchor.y)
		var y := 6.0
		for it in col:
			var ty := clampf(it.anchor.y - it.h * 0.5, y, h - it.h - 6)
			it["y"] = ty
			y = ty + it.h + 4
		# if the column ran off the bottom, push it back up
		var over := (y - 4) - (h - 6)
		if over > 0:
			for k in range(col.size() - 1, -1, -1):
				col[k]["y"] = maxf(6.0, col[k]["y"] - over)
	for it in items:
		var b: Button = it.p.pill
		var x: float = it.anchor.x - it.w - 26 if it.left else it.anchor.x + 26
		x = clampf(x, 4, w - it.w - 4)
		b.size = Vector2(it.w, it.h)
		b.position = Vector2(x, it.y)
		b.modulate.a = 0.35 if it.behind else 1.0
		it.p["anchor"] = it.anchor
	_overlay.queue_redraw()


func _draw_leaders() -> void:
	if not labels_on:
		return
	for p in _pills:
		if not p.has("anchor") or not p.pill.visible:
			continue
		var b: Button = p.pill
		var a: Vector2 = p.anchor
		var r := Rect2(b.position, b.size)
		var end := Vector2(r.position.x + r.size.x if a.x > r.get_center().x else r.position.x, r.get_center().y)
		var c := Color(UI.ACCENT, 0.7 * b.modulate.a)
		_overlay.draw_line(end, a, c, 1.2, true)
		_overlay.draw_circle(a, 3.2, Color(1, 1, 1, 0.9 * b.modulate.a))
		_overlay.draw_circle(a, 5.5, Color(UI.ACCENT, 0.3 * b.modulate.a))


func pause_render(paused: bool) -> void:
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED if paused else SubViewport.UPDATE_ALWAYS

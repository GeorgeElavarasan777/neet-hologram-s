class_name UI
extends RefCounted
## The HoloStudy look in one place: colours, fonts, the theme, line icons (SVG, drawn at the screen's
## pixel density so they stay sharp) and small builders used by every screen.

# Palettes. "calm" (default): a ruled study notebook — cool paper, blue-black ink, a fountain-pen blue for
# actions and the notebook's rose margin line. "calm_night": the same notebook in deep slate ink for
# evening study. "hologram": the original dark cyan look.
const PALETTES := {
	"calm": {"dark": false, "bg": "#eef2f1", "panel": "#f8faf9", "card": "#f8faf9", "card2": "#e6ecec", "border": "#d5dee0", "border2": "#bcc8cc",
		"text": "#1f2a30", "text2": "#46555e", "muted": "#63737b", "accent": "#2f5d8c", "good": "#3f7a5c", "bad": "#a8474f", "warn": "#9a6a12", "margin": "#c46b78",
		"physics": "#336b9c", "chemistry": "#8e4f84", "biology": "#3f7a5c"},
	"calm_night": {"dark": true, "bg": "#1b2228", "panel": "#20282f", "card": "#222b32", "card2": "#2a343c", "border": "#33404a", "border2": "#425260",
		"text": "#e3e9ec", "text2": "#b0bdc4", "muted": "#8b9aa2", "accent": "#8db4da", "good": "#7fb89a", "bad": "#d98a92", "warn": "#d3ae62", "margin": "#b87a84",
		"physics": "#7fb0d9", "chemistry": "#c49abd", "biology": "#8ec0a2"},
	"hologram": {"dark": true, "bg": "#0f1115", "panel": "#15181e", "card": "#1c2028", "card2": "#232834", "border": "#2a2f3a", "border2": "#363c49",
		"text": "#e9ecf2", "text2": "#bcc2ce", "muted": "#828a99", "accent": "#4fd1e8", "good": "#4ade80", "bad": "#f87171", "warn": "#fbbf24", "margin": "#4fd1e8",
		"physics": "#22d3ee", "chemistry": "#f472b6", "biology": "#4ade80"},
}
const PALETTE_NAMES := {"calm": "Calm", "calm_night": "Calm night", "hologram": "Hologram"}

static var palette := "calm"
static var DARK := false
static var BG := Color("#eef2f1")
static var PANEL := Color("#f8faf9")
static var CARD := Color("#f8faf9")
static var CARD2 := Color("#e6ecec")
static var BORDER := Color("#d5dee0")
static var BORDER2 := Color("#bcc8cc")
static var TEXT := Color("#1f2a30")
static var TEXT2 := Color("#46555e")
static var MUTED := Color("#63737b")
static var ACCENT := Color("#2f5d8c")
static var GOOD := Color("#3f7a5c")
static var BAD := Color("#a8474f")
static var WARN := Color("#9a6a12")
static var MARGIN := Color("#c46b78") # the notebook margin rule
static var HOVER := Color(0, 0, 0, 0.05) # tints over any surface
static var PRESS := Color(0, 0, 0, 0.09)
static var TRACK := Color(0, 0, 0, 0.08) # empty part of progress bars
static var ON_ACCENT := Color.WHITE # text on a filled accent button
static var SUBJECT := {"physics": Color("#336b9c"), "chemistry": Color("#8e4f84"), "biology": Color("#3f7a5c")}


static func set_palette(name: String) -> void:
	if not PALETTES.has(name):
		name = "calm"
	palette = name
	var p: Dictionary = PALETTES[name]
	DARK = p.dark
	BG = Color(p.bg)
	PANEL = Color(p.panel)
	CARD = Color(p.card)
	CARD2 = Color(p.card2)
	BORDER = Color(p.border)
	BORDER2 = Color(p.border2)
	TEXT = Color(p.text)
	TEXT2 = Color(p.text2)
	MUTED = Color(p.muted)
	ACCENT = Color(p.accent)
	GOOD = Color(p.good)
	BAD = Color(p.bad)
	WARN = Color(p.warn)
	MARGIN = Color(p.margin)
	var tint := Color.WHITE if DARK else Color(0.06, 0.1, 0.13)
	HOVER = Color(tint, 0.06)
	PRESS = Color(tint, 0.11)
	TRACK = Color(tint, 0.1 if DARK else 0.09)
	SUBJECT = {"physics": Color(p.physics), "chemistry": Color(p.chemistry), "biology": Color(p.biology)}
	ON_ACCENT = on_color(ACCENT)


## readable text colour on a filled background
static func on_color(bg: Color) -> Color:
	return Color("#0b1418") if bg.get_luminance() > 0.5 else Color.WHITE


const SUBJECT_ICON := {"physics": "atom", "chemistry": "flask", "biology": "leaf"}
const HOLO_SUB := {"phy": "physics", "chem": "chemistry", "bio": "biology"}

static var theme: Theme
static var f_reg: FontVariation
static var f_med: FontVariation
static var f_semi: FontVariation
static var f_bold: FontVariation
static var f_mono: FontVariation
static var f_serif: FontVariation # reading: notes, pages, questions, headings
static var f_serif_semi: FontVariation
static var scale := 1.0 # device pixel ratio × user size (icons are rasterised at this density)
static var _icons := {}

# 24×24 line icons (stroke = currentColor white; tinted with modulate / button icon colours)
const ICONS := {
	"back": '<path d="M15 18l-6-6 6-6"/>',
	"chev": '<path d="M9 18l6-6-6-6"/>',
	"down": '<path d="M6 9l6 6 6-6"/>',
	"menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
	"close": '<path d="M18 6L6 18M6 6l12 12"/>',
	"more": '<circle cx="5" cy="12" r="1.6" fill="#fff" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="#fff" stroke="none"/>',
	"play": '<path d="M7.5 4.8v14.4L19.5 12z" fill="#fff" stroke-width="1.6"/>',
	"pause": '<path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" fill="#fff" stroke="none"/>',
	"next": '<path d="M5 5.5l9.5 6.5L5 18.5z" fill="#fff" stroke-width="1.4"/><path d="M19 5v14"/>',
	"prev": '<path d="M19 5.5L9.5 12l9.5 6.5z" fill="#fff" stroke-width="1.4"/><path d="M5 5v14"/>',
	"replay": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
	"listen": '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
	"read": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>',
	"holo": '<path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M12 21.5V12M20.5 7.3L12 12 3.5 7.3"/>',
	"summary": '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
	"practice": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="#fff"/>',
	"rocket": '<path d="M12 2.5c3 2.8 4.2 6.6 4.2 10.6L12 16.5l-4.2-3.4c0-4 1.2-7.8 4.2-10.6z"/><path d="M7.8 13.1l-3 3 .9 3.3 3-1.6M16.2 13.1l3 3-.9 3.3-3-1.6"/><circle cx="12" cy="9" r="1.5"/>',
	"home": '<path d="M3 10.5l9-7.5 9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
	"check": '<path d="M20 6L9 17l-5-5"/>',
	"search": '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
	"layers": '<path d="M12 2.5l10 5-10 5-10-5z"/><path d="M2 17l10 5 10-5M2 12.2l10 5 10-5"/>',
	"tag": '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5" fill="#fff"/>',
	"quiz": '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
	"target": '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
	"bulb": '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
	"info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
	"star": '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
	"atom": '<circle cx="12" cy="12" r="1.6" fill="#fff"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
	"flask": '<path d="M9 3h6M10 3v6L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7.2 15h9.6"/>',
	"leaf": '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-10 16-10 0 10-4 16-9 17z"/><path d="M4 21c4-4 7-7 11-11"/>',
	"volume": '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
	"sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
	"eye": '<path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
	"shield": '<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/>',
	"spark": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
}


static func setup(ui_scale: float) -> Theme:
	scale = ui_scale
	_icons.clear()
	var inter: FontFile = load("res://assets/fonts/Inter.ttf")
	var mono: FontFile = load("res://assets/fonts/JetBrainsMono.ttf")
	var serif: FontFile = load("res://assets/fonts/Literata.ttf")
	var fallbacks: Array[Font] = []
	for f in ["NotoSans-fallback.ttf", "NotoSansMath-fallback.ttf", "NotoSymbols2-fallback.ttf"]:
		var ff: FontFile = load("res://assets/fonts/" + f)
		if ff:
			fallbacks.append(ff)
	inter.fallbacks = fallbacks
	var serif_fb: Array[Font] = [inter]
	serif_fb.append_array(fallbacks)
	serif.fallbacks = serif_fb
	mono.fallbacks = [inter]
	f_reg = _variant(inter, 420)
	f_med = _variant(inter, 520)
	f_semi = _variant(inter, 610)
	f_bold = _variant(inter, 720)
	f_mono = _variant(mono, 500)
	f_serif = _variant(serif, 400)
	f_serif_semi = _variant(serif, 600)
	theme = _build_theme()
	return theme


static func _variant(base: FontFile, weight: int) -> FontVariation:
	var v := FontVariation.new()
	v.base_font = base
	v.variation_opentype = {"wght": weight}
	v.fallbacks = base.fallbacks
	return v


static func sb(bg: Color, radius := 12, border := Color(0, 0, 0, 0), bw := 0, pad := Vector4(12, 8, 12, 8)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(bw)
	s.content_margin_left = pad.x
	s.content_margin_top = pad.y
	s.content_margin_right = pad.z
	s.content_margin_bottom = pad.w
	s.anti_aliasing = true
	s.corner_detail = 8
	return s


static func _build_theme() -> Theme:
	var t := Theme.new()
	t.default_font = f_reg
	t.default_font_size = 15
	t.set_color("font_color", "Label", TEXT)
	# buttons (a quiet card style; see btn() for the primary / chip / ghost kinds)
	t.set_stylebox("normal", "Button", sb(CARD, 12, BORDER, 1, Vector4(14, 9, 14, 9)))
	t.set_stylebox("hover", "Button", sb(CARD2, 12, BORDER2, 1, Vector4(14, 9, 14, 9)))
	t.set_stylebox("pressed", "Button", sb(CARD2, 12, Color(ACCENT, 0.6), 1, Vector4(14, 9, 14, 9)))
	t.set_stylebox("hover_pressed", "Button", sb(CARD2, 12, Color(ACCENT, 0.6), 1, Vector4(14, 9, 14, 9)))
	t.set_stylebox("disabled", "Button", sb(CARD.darkened(0.2), 12, BORDER, 1, Vector4(14, 9, 14, 9)))
	var focus := sb(Color(0, 0, 0, 0), 12, ACCENT, 2, Vector4())
	focus.draw_center = false
	t.set_stylebox("focus", "Button", focus)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		t.set_color(c, "Button", TEXT)
	t.set_color("font_disabled_color", "Button", MUTED)
	for c in ["icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color", "icon_focus_color"]:
		t.set_color(c, "Button", TEXT)
	t.set_constant("h_separation", "Button", 8)
	t.set_font("font", "Button", f_semi)
	t.set_font_size("font_size", "Button", 15)
	# text input
	t.set_stylebox("normal", "LineEdit", sb(CARD, 12, BORDER, 1, Vector4(14, 10, 14, 10)))
	t.set_stylebox("focus", "LineEdit", sb(CARD, 12, Color(ACCENT, 0.7), 1, Vector4(14, 10, 14, 10)))
	t.set_color("font_color", "LineEdit", TEXT)
	t.set_color("font_placeholder_color", "LineEdit", MUTED)
	t.set_color("caret_color", "LineEdit", ACCENT)
	t.set_color("selection_color", "LineEdit", Color(ACCENT, 0.3))
	# scroll bars: thin, out of the way
	var bar := sb(Color(1, 1, 1, 0.0), 4, Color(0, 0, 0, 0), 0, Vector4(0, 0, 0, 0))
	var grab := sb(Color(TEXT, 0.18), 4, Color(0, 0, 0, 0), 0, Vector4(3, 3, 3, 3))
	var grab_h := sb(Color(TEXT, 0.32), 4, Color(0, 0, 0, 0), 0, Vector4(3, 3, 3, 3))
	for s in ["VScrollBar", "HScrollBar"]:
		t.set_stylebox("scroll", s, bar)
		t.set_stylebox("scroll_focus", s, bar)
		t.set_stylebox("grabber", s, grab)
		t.set_stylebox("grabber_highlight", s, grab_h)
		t.set_stylebox("grabber_pressed", s, grab_h)
	t.set_stylebox("panel", "ScrollContainer", StyleBoxEmpty.new())
	t.set_stylebox("panel", "PanelContainer", StyleBoxEmpty.new())
	# slider
	t.set_stylebox("slider", "HSlider", sb(BORDER2, 3, Color(0, 0, 0, 0), 0, Vector4(0, 3, 0, 3)))
	t.set_stylebox("grabber_area", "HSlider", sb(ACCENT, 3, Color(0, 0, 0, 0), 0, Vector4(0, 3, 0, 3)))
	t.set_stylebox("grabber_area_highlight", "HSlider", sb(ACCENT, 3, Color(0, 0, 0, 0), 0, Vector4(0, 3, 0, 3)))
	t.set_icon("grabber", "HSlider", _dot_texture(22, ACCENT))
	t.set_icon("grabber_highlight", "HSlider", _dot_texture(24, ACCENT))
	t.set_constant("center_grabber", "HSlider", 1)
	# rich text (reading, notes)
	t.set_font("normal_font", "RichTextLabel", f_reg)
	t.set_font("bold_font", "RichTextLabel", f_bold)
	t.set_font("italics_font", "RichTextLabel", f_reg)
	t.set_font("mono_font", "RichTextLabel", f_mono)
	t.set_color("default_color", "RichTextLabel", TEXT)
	t.set_stylebox("normal", "RichTextLabel", StyleBoxEmpty.new())
	t.set_stylebox("focus", "RichTextLabel", StyleBoxEmpty.new())
	t.set_constant("line_separation", "RichTextLabel", 6)
	# progress bars
	t.set_stylebox("background", "ProgressBar", sb(TRACK, 3, Color(0, 0, 0, 0), 0, Vector4(0, 0, 0, 0)))
	t.set_stylebox("fill", "ProgressBar", sb(ACCENT, 3, Color(0, 0, 0, 0), 0, Vector4(0, 0, 0, 0)))
	t.set_constant("outline_size", "ProgressBar", 0)
	t.set_stylebox("panel", "TooltipPanel", sb(CARD2, 8, BORDER2, 1, Vector4(10, 6, 10, 6)))
	t.set_color("font_color", "TooltipLabel", TEXT)
	return t


static func _dot_texture(px: int, c: Color) -> ImageTexture:
	var size := int(px * scale)
	var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#%s" stroke="#%s" stroke-width="2"/></svg>' % [size, size, c.to_html(false), PANEL.to_html(false)]
	var img := Image.new()
	img.load_svg_from_string(svg, 1.0)
	var tex := ImageTexture.create_from_image(img)
	tex.set_size_override(Vector2i(px, px))
	return tex


## a line icon as a texture, rasterised for the current screen density (px = size in UI pixels)
static func icon(name: String, px := 22) -> Texture2D:
	var key := "%s@%d" % [name, px]
	if _icons.has(key):
		return _icons[key]
	var body: String = ICONS.get(name, ICONS["info"])
	var size := maxi(8, int(round(px * scale)))
	var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">%s</svg>' % [size, size, body]
	var img := Image.new()
	if img.load_svg_from_string(svg, 1.0) != OK:
		img = Image.create(size, size, false, Image.FORMAT_RGBA8)
	var tex := ImageTexture.create_from_image(img)
	if scale != 1.0:
		tex.set_size_override(Vector2i(px, px))
	_icons[key] = tex
	return tex


static func icon_rect(name: String, px := 22, color := TEXT) -> TextureRect:
	var r := TextureRect.new()
	r.texture = icon(name, px)
	r.custom_minimum_size = Vector2(px, px)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.modulate = color
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func label(text: String, size := 15, color := TEXT, font: Font = null, wrap := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if font:
		l.add_theme_font_override("font", font)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size.x = 40
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## a one-line label that ends in … when it does not fit
static func line(text: String, size := 15, color := TEXT, font: Font = null) -> Label:
	var l := label(text, size, color, font)
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.clip_text = true
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size.x = 20
	return l


## a small section heading (sentence case)
static func eyebrow(text: String, color := MUTED) -> Label:
	var l := label(text, 13, color, f_semi)
	l.add_theme_constant_override("line_spacing", 0)
	return l


## serif = the reading face (notes, pages, questions)
static func rich(size := 16, color := TEXT, serif := false) -> RichTextLabel:
	var r := RichTextLabel.new()
	if serif:
		r.add_theme_font_override("normal_font", f_serif)
		r.add_theme_font_override("bold_font", f_serif_semi)
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.custom_minimum_size.x = 40
	r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for k in ["normal_font_size", "bold_font_size", "italics_font_size", "mono_font_size"]:
		r.add_theme_font_size_override(k, size)
	r.add_theme_color_override("default_color", color)
	r.mouse_filter = Control.MOUSE_FILTER_PASS
	return r


## kinds: "card" (default), "primary", "soft" (tinted), "ghost" (no frame), "chip" (pill)
static func btn(text: String, kind := "card", icon_name := "", tint := ACCENT) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	b.custom_minimum_size.y = 44
	if icon_name != "":
		b.icon = icon(icon_name, 20)
	style_btn(b, kind, tint)
	return b


static func style_btn(b: Button, kind: String, tint := ACCENT) -> void:
	var pad := Vector4(14, 9, 14, 9)
	match kind:
		"primary":
			_btn_styles(b, sb(tint, 12, Color(0, 0, 0, 0), 0, pad), sb(tint.lightened(0.12), 12, Color(0, 0, 0, 0), 0, pad), sb(tint.darkened(0.12), 12, Color(0, 0, 0, 0), 0, pad))
			for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color", "icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color", "icon_focus_color"]:
				b.add_theme_color_override(c, on_color(tint))
		"soft":
			_btn_styles(b, sb(Color(tint, 0.13), 12, Color(tint, 0.35), 1, pad), sb(Color(tint, 0.2), 12, Color(tint, 0.5), 1, pad), sb(Color(tint, 0.28), 12, Color(tint, 0.6), 1, pad))
		"ghost":
			_btn_styles(b, sb(Color(0, 0, 0, 0), 12, Color(0, 0, 0, 0), 0, pad), sb(HOVER, 12, Color(0, 0, 0, 0), 0, pad), sb(PRESS, 12, Color(0, 0, 0, 0), 0, pad))
		"chip":
			var cp := Vector4(14, 6, 14, 6)
			_btn_styles(b, sb(CARD, 999, BORDER2, 1, cp), sb(CARD2, 999, BORDER2, 1, cp), sb(Color(tint, 0.18), 999, tint, 1, cp))
			b.add_theme_font_size_override("font_size", 14)
			b.custom_minimum_size.y = 36
		"chip_on":
			var cp2 := Vector4(14, 6, 14, 6)
			_btn_styles(b, sb(Color(tint, 0.18), 999, tint, 1, cp2), sb(Color(tint, 0.24), 999, tint, 1, cp2), sb(Color(tint, 0.3), 999, tint, 1, cp2))
			b.add_theme_font_size_override("font_size", 14)
			b.custom_minimum_size.y = 36


## the round play / pause button: filled with the action colour
static func style_play(b: Button, radius: int) -> void:
	var z := Vector4()
	_btn_styles(b, sb(ACCENT, radius, Color(0, 0, 0, 0), 0, z), sb(ACCENT.lerp(TEXT, 0.12), radius, Color(0, 0, 0, 0), 0, z), sb(ACCENT.lerp(BG, 0.15), radius, Color(0, 0, 0, 0), 0, z))
	for k in ["icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color", "icon_focus_color"]:
		b.add_theme_color_override(k, ON_ACCENT)


static func _btn_styles(b: Button, n: StyleBox, h: StyleBox, p: StyleBox) -> void:
	b.add_theme_stylebox_override("normal", n)
	b.add_theme_stylebox_override("hover", h)
	b.add_theme_stylebox_override("pressed", p)
	b.add_theme_stylebox_override("hover_pressed", p)
	b.add_theme_stylebox_override("disabled", n)


## a square icon button (finger-sized)
static func icon_btn(icon_name: String, tip := "", px := 44, kind := "ghost", icon_px := 22) -> Button:
	var b := Button.new()
	b.icon = icon(icon_name, icon_px)
	b.tooltip_text = tip
	b.custom_minimum_size = Vector2(px, px)
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.expand_icon = false
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	var pad := Vector4(0, 0, 0, 0)
	if kind == "ghost":
		_btn_styles(b, sb(Color(0, 0, 0, 0), 12, Color(0, 0, 0, 0), 0, pad), sb(HOVER, 12, Color(0, 0, 0, 0), 0, pad), sb(PRESS, 12, Color(0, 0, 0, 0), 0, pad))
	else:
		_btn_styles(b, sb(CARD, 12, BORDER, 1, pad), sb(CARD2, 12, BORDER2, 1, pad), sb(CARD2, 12, Color(ACCENT, 0.6), 1, pad))
	return b


static func card(pad := 16, bg := CARD, radius := 16, border := BORDER) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", sb(bg, radius, border, 1 if border.a > 0 else 0, Vector4(pad, pad, pad, pad)))
	var box := VBoxContainer.new()
	box.name = "Box"
	box.add_theme_constant_override("separation", 8)
	p.add_child(box)
	return p


static func box(card_node: Control) -> VBoxContainer:
	return card_node.get_node("Box")


static func vbox(sep := 8) -> VBoxContainer:
	var b := VBoxContainer.new()
	b.add_theme_constant_override("separation", sep)
	return b


static func hbox(sep := 8) -> HBoxContainer:
	var b := HBoxContainer.new()
	b.add_theme_constant_override("separation", sep)
	return b


static func spacer(min_w := 0.0, min_h := 0.0) -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.custom_minimum_size = Vector2(min_w, min_h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func pad(node: Control, l := 16, t := 16, r := 16, b := 16) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", l)
	m.add_theme_constant_override("margin_top", t)
	m.add_theme_constant_override("margin_right", r)
	m.add_theme_constant_override("margin_bottom", b)
	m.add_child(node)
	return m


static func bar(value: float, color := ACCENT, h := 6) -> ProgressBar:
	var p := ProgressBar.new()
	p.min_value = 0
	p.max_value = 1
	p.step = 0.001
	p.value = clampf(value, 0, 1)
	p.show_percentage = false
	p.custom_minimum_size.y = h
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p.add_theme_stylebox_override("fill", sb(color, 3, Color(0, 0, 0, 0), 0, Vector4()))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


## round coloured badge with an icon (subject marks, section numbers)
static func badge(icon_name: String, color: Color, px := 40) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", sb(Color(color, 0.16), px / 2, Color(color, 0.4), 1, Vector4()))
	p.custom_minimum_size = Vector2(px, px)
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN # stay round inside rows and columns
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var r := icon_rect(icon_name, int(px * 0.5), color)
	r.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	r.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	p.add_child(r)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


const MARGIN_X := 40.0 # where the notebook margin rule runs


## a list written on a notebook page: a margin rule runs down the left, each item's number sits left of it
static func margin_list(sep := 8) -> VBoxContainer:
	var v := vbox(sep)
	v.name = "MarginList"
	v.draw.connect(func() -> void: v.draw_line(Vector2(MARGIN_X, -6), Vector2(MARGIN_X, v.size.y + 6), Color(MARGIN, 0.85), 1.5))
	v.resized.connect(v.queue_redraw)
	return v


## one numbered entry of a margin_list: the number in the margin, the content to the right of the rule
static func margin_row(num: String, color: Color, content: Control) -> HBoxContainer:
	var h := hbox(0)
	var n := label(num, 18, color, f_serif_semi)
	n.custom_minimum_size.x = MARGIN_X - 9
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	n.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	n.add_theme_constant_override("line_spacing", 0)
	var top := MarginContainer.new()
	top.add_theme_constant_override("margin_top", 12)
	top.add_child(n)
	top.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(top)
	var gap := Control.new()
	gap.custom_minimum_size.x = 19
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(gap)
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(content)
	return h


## a scroll area that holds a centred column (max width on big screens)
static func scroller(content: Control, max_w := 760.0) -> ScrollContainer:
	var s := ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.scroll_deadzone = 10
	s.size_flags_vertical = Control.SIZE_EXPAND_FILL
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var center := CenterColumn.new()
	center.max_width = max_w
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.add_child(content)
	s.add_child(center)
	return s


## remove every child now (names are free at once, so rebuilt nodes keep their names) and free them later
static func clear(node: Node) -> void:
	for c in node.get_children():
		node.remove_child(c)
		c.queue_free()


static func esc(s: String) -> String:
	return s.replace("[", "[lb]")


static func plural(n: int, one: String, many := "") -> String:
	return "%d %s" % [n, one if n == 1 else (many if many != "" else one + "s")]


static func subject_color(key: String) -> Color:
	return SUBJECT.get(key, ACCENT)

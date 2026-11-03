class_name PixelArt
extends RefCounted
## Pixel art for the Space shooter, all drawn in code (original designs): sprites written as rows of palette
## letters and baked once into small textures (drawn with nearest filtering, so each texel is a crisp square),
## a 3×5 pixel font for score pop-ups, a dithered planet, the city skyline and the explosion palette.

# The player's ship: an eagle seen from above — white head, hooked yellow beak, swept wings with feather tips,
# a cockpit in the bronze body and a fanned tail. 23 × 17.
const EAGLE := [
	"...........Y...........",
	"..........YOY..........",
	".........WYOYW.........",
	"........WWWYWWW........",
	".......WKWWWWWKW.......",
	".......wWWWWWWWw.......",
	"........bwWWWwb........",
	"F......bBBGCGBBb......F",
	"SF....bBBBCCCBBBb....FS",
	"sSF..bBBBBCcCBBBBb..FSs",
	".sSSSBBBBBBcBBBBBBSSSs.",
	"..ssSSSBBBBBBBBBSSSss..",
	"....sssSbBBGBBbSsss....",
	".......s.bBBBb.s.......",
	".........bGBGb.........",
	"........F.bBb.F........",
	".......F..b.b..F.......",
]
const EAGLE_PAL := {"Y": "#ffcf3a", "O": "#e88a1a", "W": "#f5f7fa", "w": "#c3ccd6", "K": "#10141c", "b": "#5e3b1f", "B": "#a86a35",
	"G": "#f2c14e", "C": "#8ff0ff", "c": "#2f9fd0", "S": "#6a8fd6", "s": "#34508a", "F": "#e9edf2"}

# Plasma flame under the tail, three flickering frames. 7 × 5.
const FLAME := [
	["..cCc..", ".cCYCc.", "..cYc..", "...c...", "......."],
	[".cCCCc.", "cCYYYCc", ".cCYCc.", "..cCc..", "...c..."],
	["..cCc..", ".cCYCc.", ".cCYCc.", "..cCc..", "......."],
]
const FLAME_PAL := {"Y": "#ffffff", "C": "#8ff0ff", "c": "#2f8fd8"}

# The drone that carries an answer: grey levels, tinted with the answer's colour when drawn. 13 × 6, two frames.
const DRONE := [
	["....DMMMD....", "..DMLHHHLMD..", ".DMLLKLKLLMD.", "DMMLLLLLLLMMD", "DD.MMDDDMM.DD", "D...D...D...D"],
	["....DMMMD....", "..DMLHHHLMD..", ".DMLLKLKLLMD.", "DMMLLLLLLLMMD", ".DD.MDDDM.DD.", "..D..D.D..D.."],
]
const DRONE_PAL := {"H": "#ffffff", "L": "#dcdcdc", "M": "#a4a4a4", "D": "#626262", "K": "#0b0d12"}

# Explosion colours, young → old.
const FIRE := [Color("#ffffff"), Color("#fff3b0"), Color("#ffc94d"), Color("#ff8a3d"), Color("#e5484d"), Color("#5b2333")]

# 3 × 5 pixel font: what the pop-ups need (A–Z, 0–9, + - x !).
const FONT := {
	"A": [".#.", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."], "C": [".##", "#..", "#..", "#..", ".##"],
	"D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
	"G": [".##", "#..", "#.#", "#.#", ".##"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
	"J": ["..#", "..#", "..#", "#.#", ".#."], "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
	"M": ["#.#", "###", "###", "#.#", "#.#"], "N": ["##.", "#.#", "#.#", "#.#", "#.#"], "O": [".#.", "#.#", "#.#", "#.#", ".#."],
	"P": ["##.", "#.#", "##.", "#..", "#.."], "Q": [".#.", "#.#", "#.#", "##.", ".##"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
	"S": [".##", "#..", ".#.", "..#", "##."], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
	"V": ["#.#", "#.#", "#.#", "#.#", ".#."], "W": ["#.#", "#.#", "###", "###", "#.#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
	"Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"],
	"0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["##.", "..#", ".#.", "#..", "###"],
	"3": ["##.", "..#", ".#.", "..#", "##."], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "##.", "..#", "##."],
	"6": [".##", "#..", "###", "#.#", "###"], "7": ["###", "..#", ".#.", ".#.", ".#."], "8": ["###", "#.#", "###", "#.#", "###"],
	"9": ["###", "#.#", "###", "..#", "##."], "+": ["...", ".#.", "###", ".#.", "..."], "-": ["...", "...", "###", "...", "..."],
	"x": ["...", "#.#", ".#.", "#.#", "..."], "!": [".#.", ".#.", ".#.", "...", ".#."], " ": ["...", "...", "...", "...", "..."],
}

static var _cache := {}


static func bake(key: String, rows: Array, pal: Dictionary) -> ImageTexture:
	if _cache.has(key):
		return _cache[key]
	var w := 0
	for r in rows:
		w = maxi(w, str(r).length())
	var img := Image.create_empty(w, rows.size(), false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for y in rows.size():
		var r: String = rows[y]
		for x in r.length():
			if pal.has(r[x]):
				img.set_pixel(x, y, Color(str(pal[r[x]])))
	var tex := ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex


## the eagle with its wings level (0) or raised (1): the raised frame moves the outer wing columns up a row
static func eagle(frame: int) -> ImageTexture:
	if frame == 0:
		return bake("eagle0", EAGLE, EAGLE_PAL)
	var w: int = str(EAGLE[0]).length()
	var rows: Array = []
	for y in EAGLE.size():
		var r := ""
		for x in w:
			var src: int = y + 1 if (x < 6 or x >= w - 6) else y
			r += str(EAGLE[src])[x] if src < EAGLE.size() else "."
		rows.append(r)
	return bake("eagle1", rows, EAGLE_PAL)


static func flame(frame: int) -> ImageTexture:
	return bake("flame%d" % frame, FLAME[frame % FLAME.size()], FLAME_PAL)


static func drone(frame: int) -> ImageTexture:
	return bake("drone%d" % frame, DRONE[frame % DRONE.size()], DRONE_PAL)


## a sphere of radius r texels: four tones with ordered (Bayer) dithering, lit from the top left, a few craters
static func planet(r: int, base: Color) -> ImageTexture:
	var key := "planet%d%s" % [r, base.to_html()]
	if _cache.has(key):
		return _cache[key]
	var bayer := [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
	var tones := [base.darkened(0.78), base.darkened(0.5), base, base.lightened(0.3)]
	var craters := [Vector3(-0.35, -0.1, 0.22), Vector3(0.25, 0.3, 0.16), Vector3(0.05, -0.5, 0.12), Vector3(-0.1, 0.55, 0.1)]
	var light := Vector3(-0.55, -0.6, 0.6).normalized()
	var d := r * 2
	var img := Image.create_empty(d, d, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for y in d:
		for x in d:
			var v := Vector2(x + 0.5 - r, y + 0.5 - r) / float(r)
			if v.length_squared() > 1.0:
				continue
			var n := Vector3(v.x, v.y, sqrt(1.0 - v.length_squared()))
			var l := clampf(n.dot(light), 0.0, 1.0)
			for c in craters:
				if Vector2(v.x - c.x, v.y - c.y).length() < c.z:
					l *= 0.62
			var t: float = bayer[(y % 4) * 4 + x % 4] / 16.0
			img.set_pixel(x, y, tones[clampi(int(l * 3.2 + t - 0.45), 0, 3)])
	var tex := ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex


## the skyline below the ships (what you protect): {tex, lights} — lights are the antenna tips (texel positions)
static func city(cells_w: int, h := 16) -> Dictionary:
	var img := Image.create_empty(maxi(1, cells_w), h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var lights: Array = []
	var x := 0
	while x < cells_w:
		var bw := rng.randi_range(3, 7)
		var bh := rng.randi_range(4, h - 3)
		var body := Color("#121a3d") if rng.randf() < 0.5 else Color("#172254")
		for xx in range(x, mini(x + bw, cells_w)):
			for yy in range(h - bh, h):
				var c := body
				if xx == x:
					c = body.lightened(0.14)
				elif (xx - x) % 2 == 1 and (yy - (h - bh)) % 2 == 1 and yy < h - 1 and xx < x + bw - 1:
					c = Color("#e8b94f") if rng.randf() < 0.3 else Color("#202d68")
				img.set_pixel(xx, yy, c)
		if bh >= 10 and bw >= 4 and x + bw / 2 < cells_w:
			var ax := x + bw / 2
			img.set_pixel(ax, h - bh - 1, Color("#7d86ad"))
			img.set_pixel(ax, h - bh - 2, Color("#7d86ad"))
			lights.append(Vector2i(ax, h - bh - 3))
		x += bw + rng.randi_range(0, 1)
	return {"tex": ImageTexture.create_from_image(img), "lights": lights}


static func text_size(t: String, px: float) -> Vector2:
	return Vector2(maxf(0.0, t.length() * 4.0 - 1.0) * px, 5.0 * px)


## pixel text centred on `center`, each font pixel a px × px square with a dark outline
static func draw_text(ci: CanvasItem, t: String, center: Vector2, px: float, color: Color, outline := Color(0, 0, 0, 0.85)) -> void:
	var sz := text_size(t, px)
	var o := (center - sz * 0.5).round()
	var ow := maxf(1.0, roundf(px * 0.34))
	for k in 2:
		var x := o.x
		for ch in t:
			var g: Array = FONT.get(ch, FONT.get(ch.to_upper(), FONT[" "])) # lower-case x is the times sign
			for gy in 5:
				var row: String = g[gy]
				for gx in 3:
					if row[gx] != "#":
						continue
					var p := Vector2(x + gx * px, o.y + gy * px)
					if k == 0:
						ci.draw_rect(Rect2(p - Vector2(ow, ow), Vector2(px + ow * 2, px + ow * 2)), outline)
					else:
						ci.draw_rect(Rect2(p, Vector2(px, px)), color)
			x += 4 * px

class_name HoloTab
extends Control
## Hologram: the NCERT figures of this chapter (for one of your books: the library's figures that match
## it), each opening in the 3-D Hologram viewer.

var lesson: LessonScreen


func _init(l: LessonScreen) -> void:
	lesson = l


func _ready() -> void:
	var col := UI.vbox(12)
	col.name = "Holograms"
	var s := UI.scroller(UI.pad(col, 16, 16, 16, 28), 760)
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(s)
	var color := lesson.subject_color()
	var holos: Array = lesson.info.get("chapter", {}).get("holograms", []) if not lesson.info.is_empty() else []
	var book := lesson.info.has("book")
	if holos.is_empty():
		var c := UI.card(18, UI.CARD, 16)
		c.name = "NoHolo"
		UI.box(c).add_child(UI.badge("holo", color, 44))
		UI.box(c).add_child(UI.label("No hologram in the library matches this chapter" if book else "No NCERT hologram for this chapter yet", 17, UI.TEXT, UI.f_bold, true))
		UI.box(c).add_child(UI.label("HoloStudy looked for figures whose names and labels this chapter talks about, and found none. The Hologram Room has all 124 — every one can be turned, zoomed, taken apart and quizzed." if book else "The Hologram Room has 124 diagrams from the other chapters — every one can be turned, zoomed, taken apart and quizzed.", 14, UI.TEXT2, null, true))
		var go := UI.btn("Open the Hologram Room", "soft", "holo", color)
		go.pressed.connect(func() -> void: App.push(HoloRoomScreen.new()))
		UI.box(c).add_child(go)
		col.add_child(c)
		return
	var intro := "%s of this chapter in 3-D." % UI.plural(holos.size(), "figure")
	if book:
		intro = "%s from the library that this chapter talks about." % UI.plural(holos.size(), "3-D figure")
	col.add_child(UI.label(intro + " Drag to turn, pinch or scroll to zoom, tap a label to read about it.", 14, UI.TEXT2, null, true))
	await App.load_holo_index()
	for h in holos:
		var f: Dictionary = App.holo_by_id.get(h.hash, {})
		var tc := TapCard.new(14, UI.CARD, 16)
		tc.name = "Holo_" + str(h.hash)
		var row := UI.hbox(12)
		row.add_child(UI.badge("holo", color, 44))
		var t := UI.vbox(2)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.add_child(UI.label(str(h.title), 16, UI.TEXT, UI.f_bold, true))
		var meta := str(h.get("fig", ""))
		if not f.is_empty():
			meta += " · %s · %s" % [UI.plural(f.variants.size(), "view"), UI.plural(f.variants[0].labels.size(), "label")]
		t.add_child(UI.label(meta, 12, UI.MUTED))
		var why: Array = h.get("why", [])
		if book and not why.is_empty():
			var w := ", ".join(why.slice(0, 4))
			t.add_child(UI.label("A figure of the NCERT chapter with this name" if w == "NCERT chapter" else "Matched on: " + w, 12, UI.TEXT2, null, true))
		row.add_child(t)
		row.add_child(UI.icon_rect("chev", 18, UI.MUTED))
		UI.box(tc).add_child(row)
		tc.tapped.connect(func() -> void: App.push(HoloScreen.new(h.hash, 0)))
		col.add_child(tc)

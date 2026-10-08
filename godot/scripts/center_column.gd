class_name CenterColumn
extends Container
## Holds one child as a centred column no wider than max_width (phones: full width; tablets and
## desktops: a readable column in the middle). Height follows the child, so it scrolls in a ScrollContainer.

@export var max_width := 760.0:
	set(v):
		max_width = v
		queue_sort()


func _get_minimum_size() -> Vector2:
	var h := 0.0
	for c in get_children():
		if c is Control and c.visible:
			h = maxf(h, c.get_combined_minimum_size().y)
	return Vector2(0, h)


func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		var w := minf(size.x, max_width)
		for c in get_children():
			if c is Control and c.visible:
				fit_child_in_rect(c, Rect2((size.x - w) * 0.5, 0, w, maxf(size.y, c.get_combined_minimum_size().y)))
	elif what == NOTIFICATION_RESIZED:
		queue_sort()

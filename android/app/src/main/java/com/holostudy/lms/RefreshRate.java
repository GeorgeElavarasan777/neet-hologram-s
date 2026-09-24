package com.holostudy.lms;

import android.app.Activity;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.WindowManager;

import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * Chooses the screen refresh rate for the app window.
 *
 *  adaptive – the screen's highest rate while the user touches or scrolls, then back to 60 Hz
 *             about 2.5 s after the last touch (reading a page needs no extra frames), so scrolling
 *             is smooth and the battery lasts longer
 *  max      – always the highest rate the screen offers (e.g. 120 Hz)
 *  60/90/…  – a fixed rate
 *  system   – let Android decide
 *
 * Only modes with the current resolution are used, so switching never changes the resolution.
 */
final class RefreshRate {
    private static final long IDLE_MS = 2500;

    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable dropToBase = () -> setHigh(false);
    private String mode = "adaptive";
    private boolean high;

    RefreshRate(Activity activity) {
        this.activity = activity;
    }

    private Display display() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? activity.getDisplay() : activity.getWindowManager().getDefaultDisplay();
    }

    /** Display modes with the same resolution as the current one. */
    private List<Display.Mode> sameSizeModes() {
        List<Display.Mode> out = new ArrayList<>();
        Display d = display();
        if (d == null) return out;
        Display.Mode cur = d.getMode();
        for (Display.Mode m : d.getSupportedModes()) {
            if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()) out.add(m);
        }
        return out;
    }

    /** Distinct refresh rates available at the current resolution, rounded to whole Hz. */
    List<Integer> rates() {
        TreeSet<Integer> set = new TreeSet<>();
        for (Display.Mode m : sameSizeModes()) set.add(Math.round(m.getRefreshRate()));
        return new ArrayList<>(set);
    }

    float currentRate() {
        Display d = display();
        return d == null ? 60f : d.getRefreshRate();
    }

    String mode() {
        return mode;
    }

    void setMode(String newMode) {
        mode = newMode == null ? "adaptive" : newMode;
        handler.removeCallbacks(dropToBase);
        switch (mode) {
            case "system":
                apply(0);
                break;
            case "max":
                applyRate(maxRate());
                break;
            case "adaptive":
                high = true; // force the next call to apply
                setHigh(false);
                break;
            default:
                try {
                    applyRate(Integer.parseInt(mode));
                } catch (NumberFormatException e) {
                    setMode("adaptive");
                }
        }
    }

    /** Called for every touch event on the window. Cheap: it only acts when the state changes. */
    void onUserInteraction() {
        if (!"adaptive".equals(mode)) return;
        if (!high) setHigh(true);
        handler.removeCallbacks(dropToBase);
        handler.postDelayed(dropToBase, IDLE_MS);
    }

    void onPause() {
        handler.removeCallbacks(dropToBase);
        if ("adaptive".equals(mode)) setHigh(false);
    }

    private void setHigh(boolean on) {
        if (high == on) return;
        high = on;
        applyRate(on ? maxRate() : baseRate());
    }

    private int maxRate() {
        List<Integer> r = rates();
        return r.isEmpty() ? 60 : r.get(r.size() - 1);
    }

    /** The calm reading rate: 60 Hz when available, otherwise the lowest rate. */
    private int baseRate() {
        List<Integer> r = rates();
        if (r.isEmpty()) return 60;
        for (int hz : r) if (hz >= 59) return hz;
        return r.get(0);
    }

    private void applyRate(int hz) {
        Display.Mode best = null;
        for (Display.Mode m : sameSizeModes()) {
            if (best == null || Math.abs(m.getRefreshRate() - hz) < Math.abs(best.getRefreshRate() - hz)) best = m;
        }
        apply(best == null ? 0 : best.getModeId());
    }

    private void apply(int modeId) {
        WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
        if (lp.preferredDisplayModeId == modeId) return;
        lp.preferredDisplayModeId = modeId;
        activity.getWindow().setAttributes(lp);
    }
}

package com.holostudy.lms;

import android.net.Uri;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;
import java.util.Set;

/**
 * The page <-> Android channel. Exposed to the app's own origin only (never to other sites), as the
 * `SSNative` object in every frame, including the lesson iframes. Messages are JSON:
 *   { ch: "window"|"display"|"haptic"|"file"|"app"|"tts", cmd: "...", ... }
 */
final class NativeBridge implements WebViewCompat.WebMessageListener {
    private final MainActivity activity;
    private JavaScriptReplyProxy mainFrame;
    private Speech speech;

    NativeBridge(MainActivity activity, WebView web, WebAssets assets) {
        this.activity = activity;
        Set<String> origins = Collections.singleton(WebAssets.ORIGIN);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "SSNative", origins, this);
        }
        // Speech bridge must exist before the study console's own scripts run, in every frame.
        String speechJs = assets.readText("studyspace/native-speech.js");
        if (speechJs != null && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, speechJs, origins);
        }
    }

    @Override
    public void onPostMessage(@NonNull WebView view, @NonNull WebMessageCompat message, @NonNull Uri sourceOrigin,
                              boolean isMainFrame, @NonNull JavaScriptReplyProxy reply) {
        if (!WebAssets.ORIGIN.equals(sourceOrigin.toString())) return; // belt and braces
        JSONObject m;
        try {
            m = new JSONObject(message.getData() == null ? "{}" : message.getData());
        } catch (JSONException e) {
            return;
        }
        if (isMainFrame) mainFrame = reply;
        String ch = m.optString("ch"), cmd = m.optString("cmd");
        switch (ch) {
            case "app":
                if ("hello".equals(cmd) && isMainFrame) activity.onPageReady(); // deliver any file shared before the page loaded
                break;
            case "window":
                switch (cmd) {
                    case "theme": activity.applySystemBars(m.optString("top"), m.optString("bottom"), m.optBoolean("dark", true)); break;
                    case "keepAwake": activity.keepAwake(m.optBoolean("on")); break;
                    case "immersive": activity.immersive(m.optBoolean("on")); break;
                }
                break;
            case "display":
                if ("setRefresh".equals(cmd)) activity.refresh().setMode(m.optString("mode", "adaptive"));
                else if ("getModes".equals(cmd)) sendModes(reply);
                break;
            case "haptic":
                activity.haptic();
                break;
            case "file":
                if ("save".equals(cmd)) activity.saveTextFile(m.optString("name", "notes.txt"), m.optString("mime", "text/plain"), m.optString("text"), reply);
                break;
            case "tts":
                if (speech == null) speech = new Speech(activity);
                speech.handle(cmd, m, reply);
                break;
        }
    }

    private void sendModes(JavaScriptReplyProxy reply) {
        try {
            JSONArray rates = new JSONArray();
            for (int hz : activity.refresh().rates()) rates.put(hz);
            post(reply, new JSONObject().put("ch", "display").put("ev", "modes").put("rates", rates)
                    .put("current", Math.round(activity.refresh().currentRate())).put("mode", activity.refresh().mode()));
        } catch (JSONException ignored) { }
    }

    /** Send an event to the hub page (main frame). */
    void toPage(String ch, String ev, JSONObject extra) {
        if (mainFrame == null) return;
        try {
            JSONObject o = extra == null ? new JSONObject() : extra;
            post(mainFrame, o.put("ch", ch).put("ev", ev));
        } catch (JSONException ignored) { }
    }

    static void post(JavaScriptReplyProxy proxy, JSONObject o) {
        try { proxy.postMessage(o.toString()); } catch (Exception ignored) { /* page navigated away */ }
    }

    /** The WebView was recreated (renderer crash): drop references to old frames. */
    void reset() {
        mainFrame = null;
    }

    void shutdown() {
        if (speech != null) speech.shutdown();
    }
}

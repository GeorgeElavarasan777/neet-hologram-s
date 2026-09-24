package com.holostudy.lms;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import androidx.webkit.JavaScriptReplyProxy;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Android TextToSpeech behind the web page's speechSynthesis API (see studyspace/native-speech.js).
 * Long texts are split at sentence ends to fit the engine's input limit; word-boundary positions
 * are shifted back to the full text so the page can highlight the word being spoken.
 * The engine is started lazily, the first time a page asks for voices or speech.
 */
final class Speech {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> waiting = new ArrayList<>();
    private final TextToSpeech tts;
    private boolean ready, failed;

    // the utterance currently speaking
    private JavaScriptReplyProxy owner;
    private String currentId;
    private int[] chunkOffsets = new int[0];

    Speech(Context context) {
        tts = new TextToSpeech(context.getApplicationContext(), status -> main.post(() -> onReady(status)));
    }

    private void onReady(int status) {
        ready = status == TextToSpeech.SUCCESS;
        failed = !ready;
        if (ready) tts.setOnUtteranceProgressListener(listener);
        for (Runnable r : waiting) r.run();
        waiting.clear();
    }

    void handle(String cmd, JSONObject msg, JavaScriptReplyProxy reply) {
        Runnable task;
        switch (cmd) {
            case "voices": task = () -> sendVoices(reply); break;
            case "speak": task = () -> speak(msg, reply); break;
            case "stop": task = this::stop; break;
            default: return;
        }
        if (ready || failed) task.run(); else waiting.add(task);
    }

    void shutdown() {
        tts.stop();
        tts.shutdown();
    }

    // ---------- voices ----------
    private void sendVoices(JavaScriptReplyProxy reply) {
        JSONArray list = new JSONArray();
        if (ready) {
            Set<Voice> voices = null;
            try { voices = tts.getVoices(); } catch (Exception ignored) { }
            Voice def = null;
            try { def = tts.getDefaultVoice(); } catch (Exception ignored) { }
            String deviceLang = Locale.getDefault().getLanguage();
            boolean google = "com.google.android.tts".equals(tts.getDefaultEngine());
            Map<String, Integer> perLocale = new HashMap<>();
            // prefer offline voices: hide a network voice when an installed one exists for its locale
            java.util.Set<String> localLocales = new java.util.HashSet<>();
            if (voices != null) for (Voice v : voices) {
                boolean installed = v.getFeatures() == null || !v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
                if (!v.isNetworkConnectionRequired() && installed) localLocales.add(v.getLocale().toLanguageTag());
            }
            if (voices != null) for (Voice v : voices) {
                if (v.isNetworkConnectionRequired() && localLocales.contains(v.getLocale().toLanguageTag())) continue;
                Locale loc = v.getLocale();
                String lang = loc.getLanguage();
                // keep the list short: English, Hindi and the phone's own language
                if (!lang.equals("en") && !lang.equals("hi") && !lang.equals(deviceLang)) continue;
                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                String tag = loc.toLanguageTag();
                int n = perLocale.merge(tag, 1, Integer::sum);
                boolean local = !v.isNetworkConnectionRequired();
                try {
                    list.put(new JSONObject()
                            .put("id", v.getName())
                            .put("name", (google ? "Google " : "") + "Voice " + n + (local ? "" : " Online"))
                            .put("lang", tag)
                            .put("local", local)
                            .put("default", def != null && def.getName().equals(v.getName())));
                } catch (JSONException ignored) { }
            }
        }
        post(reply, event("voices").putOpt("voices", list));
    }

    // ---------- speaking ----------
    private void speak(JSONObject msg, JavaScriptReplyProxy reply) {
        String id = msg.optString("id");
        if (!ready) {
            post(reply, event("error").putOpt("id", id).putOpt("error", "synthesis-unavailable"));
            return;
        }
        // another page (or frame) was speaking: tell it that it was interrupted
        if (owner != null && currentId != null && owner != reply) post(owner, event("error").putOpt("id", currentId).putOpt("error", "interrupted"));
        tts.stop();
        owner = reply;
        currentId = id;

        String voiceName = msg.optString("voice");
        boolean voiceSet = false;
        if (!voiceName.isEmpty()) {
            try {
                for (Voice v : tts.getVoices()) if (v.getName().equals(voiceName)) { tts.setVoice(v); voiceSet = true; break; }
            } catch (Exception ignored) { }
        }
        String lang = msg.optString("lang");
        if (!voiceSet && !lang.isEmpty()) tts.setLanguage(Locale.forLanguageTag(lang));
        tts.setSpeechRate((float) Math.max(0.1, Math.min(4, msg.optDouble("rate", 1))));
        tts.setPitch((float) Math.max(0.1, Math.min(2, msg.optDouble("pitch", 1))));

        String text = msg.optString("text");
        List<int[]> chunks = split(text, Math.max(500, TextToSpeech.getMaxSpeechInputLength() - 100));
        chunkOffsets = new int[chunks.size()];
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) Math.max(0, Math.min(1, msg.optDouble("volume", 1))));
        if (chunks.isEmpty()) {
            post(owner, event("done").putOpt("id", id));
            return;
        }
        for (int i = 0; i < chunks.size(); i++) {
            int[] c = chunks.get(i);
            chunkOffsets[i] = c[0];
            tts.speak(text.substring(c[0], c[1]), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, params, id + "#" + i);
        }
    }

    private void stop() {
        currentId = null;
        if (ready) tts.stop();
    }

    /** Split into [start, end) ranges no longer than max, preferring sentence and word breaks. */
    private static List<int[]> split(String text, int max) {
        List<int[]> out = new ArrayList<>();
        int start = 0, len = text.length();
        while (start < len) {
            int end = Math.min(len, start + max);
            if (end < len) {
                int cut = -1;
                for (int i = end - 1; i > start + max / 2; i--) {
                    char ch = text.charAt(i);
                    if (ch == '.' || ch == '!' || ch == '?' || ch == '\n') { cut = i + 1; break; }
                }
                if (cut < 0) cut = text.lastIndexOf(' ', end);
                if (cut > start) end = cut;
            }
            out.add(new int[]{start, end});
            start = end;
        }
        return out;
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override public void onStart(String utteranceId) {
            main.post(() -> { if (index(utteranceId) == 0) emit(utteranceId, event("start")); });
        }

        @Override public void onRangeStart(String utteranceId, int start, int end, int frame) {
            main.post(() -> {
                int i = index(utteranceId);
                if (i < 0 || i >= chunkOffsets.length) return;
                emit(utteranceId, event("boundary").putOpt("start", chunkOffsets[i] + start).putOpt("end", chunkOffsets[i] + end));
            });
        }

        @Override public void onDone(String utteranceId) {
            main.post(() -> { if (index(utteranceId) == chunkOffsets.length - 1) emit(utteranceId, event("done")); });
        }

        @Override public void onError(String utteranceId) {
            main.post(() -> emit(utteranceId, event("error").putOpt("error", "synthesis-failed")));
        }

        @Override public void onError(String utteranceId, int errorCode) {
            main.post(() -> emit(utteranceId, event("error").putOpt("error", errorCode == TextToSpeech.ERROR_NETWORK || errorCode == TextToSpeech.ERROR_NETWORK_TIMEOUT ? "network" : "synthesis-failed")));
        }
    };

    private static int index(String utteranceId) {
        int hash = utteranceId == null ? -1 : utteranceId.lastIndexOf('#');
        if (hash < 0) return -1;
        try { return Integer.parseInt(utteranceId.substring(hash + 1)); } catch (NumberFormatException e) { return -1; }
    }

    /** Forward an engine event to the page that owns the current utterance (ignores stale ones). */
    private void emit(String utteranceId, Event e) {
        if (utteranceId == null || currentId == null || owner == null) return;
        String id = utteranceId.substring(0, Math.max(0, utteranceId.lastIndexOf('#')));
        if (!id.equals(currentId)) return;
        post(owner, e.putOpt("id", id));
        if ("done".equals(e.name) || "error".equals(e.name)) currentId = null;
    }

    private static void post(JavaScriptReplyProxy proxy, Event e) {
        try { proxy.postMessage(e.json.toString()); } catch (Exception ignored) { /* the page went away */ }
    }

    private static Event event(String name) {
        return new Event(name);
    }

    /** Tiny fluent wrapper so event building never needs try/catch at every call site. */
    private static final class Event {
        final String name;
        final JSONObject json = new JSONObject();

        Event(String name) {
            this.name = name;
            putOpt("ch", "tts");
            putOpt("ev", name);
        }

        Event putOpt(String key, Object value) {
            try { json.put(key, value); } catch (JSONException ignored) { }
            return this;
        }
    }
}

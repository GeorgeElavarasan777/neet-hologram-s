package com.holostudy.lms;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * "Open with → HoloStudy" and "Share → HoloStudy": copies the incoming document (or shared text) into
 * the app's private cache, then serves it to the page at https://appassets.androidplatform.net/shared/…
 * so the page can fetch it as a normal File — no multi-megabyte base64 strings over the bridge.
 */
final class SharedFiles {
    static final String PATH = "/shared/";
    private static final long MAX_BYTES = 120L * 1024 * 1024; // same limit as the upload button

    interface Callback {
        void onReady(JSONObject info);
        void onError(String message);
    }

    private final Context ctx;
    private final File dir;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    SharedFiles(Context context) {
        ctx = context.getApplicationContext();
        dir = new File(ctx.getCacheDir(), "shared");
    }

    /** Starts importing the intent's document off the main thread. Returns false if there is nothing to open. */
    @SuppressWarnings("deprecation")
    boolean accept(Intent intent, Callback cb) {
        if (intent == null || intent.getBooleanExtra("holostudy.handled", false)) return false;
        String action = intent.getAction();
        Uri uri = null;
        String text = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null) text = intent.getStringExtra(Intent.EXTRA_TEXT);
        } else {
            return false;
        }
        if (uri == null && (text == null || text.trim().isEmpty())) return false;
        intent.putExtra("holostudy.handled", true); // never import the same intent twice (e.g. after a recreate)

        final Uri fUri = uri;
        final String fText = text, subject = intent.getStringExtra(Intent.EXTRA_SUBJECT), fType = intent.getType();
        io.execute(() -> {
            try {
                JSONObject info = fUri != null ? copy(fUri, fType) : saveText(fText, subject);
                main.post(() -> cb.onReady(info));
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "That file could not be opened.";
                main.post(() -> cb.onError(msg));
            }
        });
        return true;
    }

    private JSONObject copy(Uri uri, String intentType) throws IOException, JSONException {
        ContentResolver cr = ctx.getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = c.getColumnIndex(OpenableColumns.SIZE);
                if (ni >= 0) name = c.getString(ni);
                if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
            }
        } catch (Exception ignored) { /* some providers don't support queries; fall back below */ }
        String type = cr.getType(uri);
        if (type == null) type = intentType;
        if (name == null) name = uri.getLastPathSegment();
        name = withExtension(sanitize(name == null ? "document" : name), type);
        if (size > MAX_BYTES) throw new IOException("That file is over 120 MB, which is too large to study here.");

        File out = freshFile(name);
        try (InputStream in = cr.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (in == null) throw new IOException("That file could not be read.");
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            for (int n; (n = in.read(buf)) > 0; ) {
                total += n;
                if (total > MAX_BYTES) throw new IOException("That file is over 120 MB, which is too large to study here.");
                os.write(buf, 0, n);
            }
        } catch (SecurityException e) {
            throw new IOException("HoloStudy was not allowed to read that file. Try opening it from the Files app.");
        }
        return info(out, type);
    }

    private JSONObject saveText(String text, String subject) throws IOException, JSONException {
        String base = subject != null && !subject.trim().isEmpty() ? subject.trim() : "Shared text";
        File out = freshFile(sanitize(base) + ".txt");
        try (OutputStream os = new FileOutputStream(out)) { os.write(text.getBytes(StandardCharsets.UTF_8)); }
        return info(out, "text/plain");
    }

    /** One shared document at a time: clear older copies so the cache never grows. */
    private File freshFile(String name) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("No space to open that file.");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
            f.delete();
        return new File(dir, name);
    }

    private static JSONObject info(File f, String type) throws JSONException {
        return new JSONObject()
                .put("url", WebAssets.ORIGIN + PATH + Uri.encode(f.getName()))
                .put("name", f.getName())
                .put("type", type != null ? type : mimeFor(f.getName()))
                .put("size", f.length());
    }

    /** Serves a copied file to the page (same origin as the app). */
    WebResourceResponse serve(Uri url) {
        String name = url.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) return notFound();
        File f = new File(dir, name);
        if (!f.isFile()) return notFound();
        try {
            WebResourceResponse r = new WebResourceResponse(mimeFor(name), null, new FileInputStream(f));
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-store");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new java.io.ByteArrayInputStream(new byte[0]));
    }

    private static String sanitize(String name) {
        String s = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (s.length() > 120) s = s.substring(0, 120);
        return s.isEmpty() ? "document" : s;
    }

    private static String withExtension(String name, String type) {
        if (name.matches("(?i).*\\.(pdf|docx|txt|md|markdown)$") || type == null) return name;
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
        if ("text/markdown".equals(type)) ext = "md";
        return ext != null ? name + "." + ext : name;
    }

    private static String mimeFor(String name) {
        String n = name.toLowerCase(java.util.Locale.ROOT);
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (n.endsWith(".md") || n.endsWith(".markdown")) return "text/markdown";
        return "text/plain";
    }
}

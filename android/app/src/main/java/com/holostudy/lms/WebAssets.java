package com.holostudy.lms;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves the bundled web app from https://appassets.androidplatform.net/assets/… (a real https
 * origin, so localStorage, IndexedDB and same-origin iframes work) and answers the study console's
 * CDN requests (pdf.js, JSZip, Google Fonts) from bundled copies, so the app works fully offline.
 * Anything not bundled (only the optional AI agent's API calls) goes to the network as normal.
 */
final class WebAssets {
    static final String HOST = WebViewAssetLoader.DEFAULT_DOMAIN;
    static final String ORIGIN = "https://" + HOST;
    static final String START_URL = ORIGIN + "/assets/index.html";

    private final WebViewAssetLoader loader;
    private final AssetManager assets;

    WebAssets(Context context) {
        assets = context.getAssets();
        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();
    }

    WebResourceResponse intercept(WebResourceRequest request) {
        Uri url = request.getUrl();
        String host = url.getHost();
        String path = url.getPath();
        if (host == null || path == null) return null;
        switch (host) {
            case HOST:
                return loader.shouldInterceptRequest(url);
            case "cdnjs.cloudflare.com":
                return bundled("vendor/cdnjs" + path, mimeFor(path));
            case "fonts.googleapis.com":
                return path.startsWith("/css") ? bundled("vendor/google-fonts/study.css", "text/css") : null;
            default:
                return null;
        }
    }

    /** Also used to read the speech bridge script that is injected into every page. */
    String readText(String path) {
        try (InputStream in = assets.open(path)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            return null;
        }
    }

    private WebResourceResponse bundled(String assetPath, String mime) {
        try {
            InputStream in = assets.open(assetPath);
            WebResourceResponse response = new WebResourceResponse(mime, "utf-8", in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "max-age=31536000, immutable");
            response.setResponseHeaders(headers);
            return response;
        } catch (IOException notBundled) {
            return null; // fall back to the network
        }
    }

    private static String mimeFor(String path) {
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
}

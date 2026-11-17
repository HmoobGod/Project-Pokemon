package org.projectpokemon.offlinesandbox;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.ViewGroup;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.util.Collections;

/**
 * Disposable, asset-only Android demonstration. NOT the original PokéBonk client.
 * This activity never requests INTERNET permission, connects to a server,
 * reads player saves, or grants in-game rewards.
 */
public final class OfflineSandboxActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_ROOT = "/assets/";
    private static final String START_PAGE =
            "https://" + ASSET_HOST + ASSET_ROOT + "index.html";
    private WebView webView;

    private static boolean isBundledResource(Uri uri) {
        return uri != null
                && "https".equals(uri.getScheme())
                && ASSET_HOST.equals(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith(ASSET_ROOT)
                && uri.getUserInfo() == null
                && uri.getPort() == -1;
    }

    private static WebResourceResponse denied(int code, String reason) {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                code,
                reason,
                Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0])
        );
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        webView = new WebView(this);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        // App-local HTTPS *origin* is mapped to APK assets, not the internet.
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .setHttpAllowed(false)
                .addPathHandler(ASSET_ROOT, new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        final WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Required by bundled, original JS engine.
        settings.setDomStorageEnabled(false); // No profiles/saves in this proof of packaging.
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true);
        settings.setBlockNetworkImage(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setGeolocationEnabled(false);

        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                if (!isBundledResource(request.getUrl())) {
                    return denied(403, "External resources disabled");
                }
                WebResourceResponse result = assets.shouldInterceptRequest(request.getUrl());
                return result == null ? denied(404, "Bundled resource not found") : result;
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                return !isBundledResource(request.getUrl());
            }
        });

        webView.loadUrl(START_PAGE);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

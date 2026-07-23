package com.youngsix.msyk;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private FrameLayout rootView;
    private WebView inlineViewer;
    private String inlineViewerUrl = "";
    private String inlineViewerTheme = "dark";
    private NativeApiBridge bridge;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        MsykApiClient apiClient = new MsykApiClient(this);
        bridge = new NativeApiBridge(apiClient);
        webView = new WebView(this);
        rootView = new FrameLayout(this);
        rootView.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootView);

        configureWebView(apiClient);
        String page = apiClient.hasSession() ? "main" : "login";
        webView.loadUrl(APP_ORIGIN + "/assets/renderer/" + page + "/index.html");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(MsykApiClient apiClient) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MSYK-Android/" + BuildConfig.VERSION_NAME);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                hideInlineViewer();
            }

            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame() || APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority())) {
                    return false;
                }
                if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.putExtra(
                        Intent.EXTRA_ALLOW_MULTIPLE,
                        params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            registerNativeBridge();
            registerViewerBridge();
            registerInlineViewerBridge();
        } else {
            Toast.makeText(this, "系统 WebView 版本过低，无法启用安全 API 桥接", Toast.LENGTH_LONG).show();
        }
    }

    @SuppressLint("RequiresFeature")
    private void registerNativeBridge() {
        WebViewCompat.addWebMessageListener(
                webView,
                "MSYK_ANDROID",
                Collections.singleton(APP_ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    bridge.handle(message.getData(), response ->
                            view.post(() -> replyProxy.postMessage(response)));
                });
    }

    @SuppressLint("RequiresFeature")
    private void registerViewerBridge() {
        WebViewCompat.addWebMessageListener(
                webView,
                "MSYK_VIEWER",
                Collections.singleton(APP_ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    try {
                        JSONObject request = new JSONObject(message.getData());
                        String url = request.optString("url", "").trim();
                        Uri uri = Uri.parse(url);
                        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
                            Toast.makeText(this, "材料地址无效", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        String title = request.optString("title", "材料查看");
                        String type = request.optString("type", "");
                        String theme = request.optString("theme", "dark");
                        view.post(() -> DocumentViewerActivity.open(this, url, title, type, theme));
                    } catch (Exception error) {
                        Toast.makeText(this, "无法打开材料", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    @SuppressLint("RequiresFeature")
    private void registerInlineViewerBridge() {
        WebViewCompat.addWebMessageListener(
                webView,
                "MSYK_INLINE_VIEWER",
                Collections.singleton(APP_ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    try {
                        JSONObject request = new JSONObject(message.getData());
                        if ("postSystemExerciseAnswer".equals(request.optString("action"))) {
                            String studentId = request.optString("studentId", "");
                            String questionId = request.optString("questionId", "");
                            if (inlineViewer != null && !studentId.isEmpty() && !questionId.isEmpty()) {
                                String script = "javascript:SingleQuestion.postAnswer("
                                        + JSONObject.quote(studentId) + "," + JSONObject.quote(questionId) + ")";
                                view.post(() -> inlineViewer.loadUrl(script));
                            }
                            return;
                        }
                        if ("hide".equals(request.optString("action"))) {
                            view.post(this::hideInlineViewer);
                            return;
                        }
                        String url = request.optString("url", "").trim();
                        Uri uri = Uri.parse(url);
                        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return;
                        view.post(() -> showInlineViewer(request, url));
                    } catch (Exception ignored) {
                    }
                });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void ensureInlineViewer() {
        if (inlineViewer != null) return;
        inlineViewer = new WebView(this);
        WebSettings settings = inlineViewer.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(settings.getUserAgentString()
                + " MSYK-Android/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptThirdPartyCookies(inlineViewer, true);
        inlineViewer.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void getAnswer(String answer, String questionId, String isCorrect) {
                try {
                    JSONObject detail = new JSONObject()
                            .put("answer", answer).put("questionId", questionId).put("isCorrect", isCorrect);
                    String script = "window.dispatchEvent(new CustomEvent('msyk-school-answer',{detail:JSON.parse("
                            + JSONObject.quote(detail.toString()) + ")}));";
                    webView.post(() -> webView.evaluateJavascript(script, null));
                } catch (Exception ignored) {
                }
            }

            @JavascriptInterface
            public void isOpenTime() {
            }
        }, "jsCallback");
        inlineViewer.setBackgroundColor(Color.parseColor("#0F1226"));
        inlineViewer.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!url.equals(inlineViewerUrl)) return;
                if ("dark".equalsIgnoreCase(inlineViewerTheme)) view.setVisibility(View.INVISIBLE);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                revealInlineViewerAfterTheme(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                revealInlineViewerAfterTheme(url);
                view.postDelayed(() -> {
                    if (url.equals(inlineViewerUrl)) applyInlineViewerTheme();
                }, 500);
                view.postDelayed(() -> {
                    if (url.equals(inlineViewerUrl)) applyInlineViewerTheme();
                }, 1500);
            }
        });
        inlineViewer.setVisibility(View.GONE);
        rootView.addView(inlineViewer, new FrameLayout.LayoutParams(1, 1));
    }

    private void showInlineViewer(JSONObject request, String url) {
        ensureInlineViewer();
        int rootWidth = rootView.getWidth();
        int rootHeight = rootView.getHeight();
        int left = Math.max(0, request.optInt("left"));
        int top = Math.max(0, request.optInt("top"));
        int width = Math.min(request.optInt("width"), rootWidth - left);
        int height = Math.min(request.optInt("height"), rootHeight - top);
        if (width <= 0 || height <= 0) {
            hideInlineViewer();
            return;
        }

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, height);
        params.leftMargin = left;
        params.topMargin = top;
        inlineViewer.setLayoutParams(params);

        String theme = request.optString("theme", "dark");
        boolean themeChanged = !theme.equals(inlineViewerTheme);
        inlineViewerTheme = theme;
        boolean dark = "dark".equalsIgnoreCase(theme);
        inlineViewer.setBackgroundColor(Color.parseColor(dark ? "#0F1226" : "#FFFFFF"));
        if (!url.equals(inlineViewerUrl)) {
            inlineViewerUrl = url;
            inlineViewer.setVisibility(dark ? View.INVISIBLE : View.VISIBLE);
            inlineViewer.loadUrl(url);
        } else if (themeChanged) {
            if (dark) inlineViewer.setVisibility(View.INVISIBLE);
            applyInlineViewerTheme(() -> inlineViewer.setVisibility(View.VISIBLE));
        } else {
            inlineViewer.setVisibility(View.VISIBLE);
        }
    }

    private void hideInlineViewer() {
        if (inlineViewer == null) return;
        inlineViewer.setVisibility(View.GONE);
        inlineViewer.stopLoading();
        inlineViewer.loadUrl("about:blank");
        inlineViewerUrl = "";
    }

    private void revealInlineViewerAfterTheme(String url) {
        if (!url.equals(inlineViewerUrl)) return;
        applyInlineViewerTheme(() -> {
            if (url.equals(inlineViewerUrl)) inlineViewer.setVisibility(View.VISIBLE);
        });
    }

    private void applyInlineViewerTheme() {
        applyInlineViewerTheme(null);
    }

    private void applyInlineViewerTheme(@Nullable Runnable completion) {
        if (inlineViewer == null || inlineViewer.getVisibility() == View.GONE) return;
        String css = "light".equalsIgnoreCase(inlineViewerTheme) ? "" :
                "html,body{background:#0f1226!important;color:#eaf2ff!important;}"
                + "*{color:inherit!important;background-color:transparent!important;"
                + "background-image:none!important;border-color:rgba(255,255,255,.15)!important;}"
                + ".dtk-container,.title-container{background:#161929!important;}"
                + ".col-999{color:#8899bb!important;}"
                + ".right-score,.left-scroe{background:rgba(255,255,255,.08)!important;color:#7ecbff!important;}"
                + ".right-answer-my span,.span-class{background:#1e2a45!important;color:#eaf2ff!important;}"
                + ".right-answer-my span.active,.span-class.active{background:#2a5298!important;color:#fff!important;}"
                + "a{color:#9cc8ff!important;}";
        String script = "(function(){var s=document.getElementById('__msyk_theme');"
                + "if(!s){s=document.createElement('style');s.id='__msyk_theme';document.head.appendChild(s);}"
                + "s.textContent=" + JSONObject.quote(css) + ";"
                + "document.documentElement.style.colorScheme=" + JSONObject.quote(inlineViewerTheme) + ";})()";
        inlineViewer.evaluateJavascript(script, value -> {
            if (completion != null) completion.run();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        ValueCallback<Uri[]> callback = fileChooserCallback;
        fileChooserCallback = null;
        if (resultCode != RESULT_OK) {
            callback.onReceiveValue(null);
            return;
        }
        Uri[] result = collectFileChooserResult(resultCode, data);
        if (result == null || result.length == 0) {
            Toast.makeText(this, "未能读取所选文件，请重新选择", Toast.LENGTH_SHORT).show();
            callback.onReceiveValue(null);
            return;
        }
        callback.onReceiveValue(result);
    }

    @Nullable
    private Uri[] collectFileChooserResult(int resultCode, @Nullable Intent data) {
        if (resultCode != RESULT_OK || data == null) return null;

        Set<Uri> candidates = new LinkedHashSet<>();
        Uri[] parsed = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        if (parsed != null) Collections.addAll(candidates, parsed);

        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                candidates.add(clipData.getItemAt(index).getUri());
            }
        }
        if (data.getData() != null) candidates.add(data.getData());

        List<Uri> safeUris = new ArrayList<>();
        for (Uri uri : candidates) {
            if (uri == null) continue;
            String scheme = uri.getScheme();
            if ("content".equalsIgnoreCase(scheme) || "file".equalsIgnoreCase(scheme)) {
                safeUris.add(uri);
            }
        }
        return safeUris.isEmpty() ? null : safeUris.toArray(new Uri[0]);
    }

    @Override
    public void onBackPressed() {
        String url = webView.getUrl();
        if (url != null && url.startsWith(APP_ORIGIN)
                && !url.contains("/home/index.html")
                && !url.contains("/main/index.html")
                && !url.contains("/login/index.html")) {
            webView.evaluateJavascript(
                    "document.getElementById('backBtn')?.click()",
                    null);
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        if (bridge != null) bridge.close();
        if (inlineViewer != null) {
            inlineViewer.stopLoading();
            inlineViewer.destroy();
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}

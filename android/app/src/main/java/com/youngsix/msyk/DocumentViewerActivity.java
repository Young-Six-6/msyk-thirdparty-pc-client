package com.youngsix.msyk;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.pdf.PdfRenderer;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.Nullable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class DocumentViewerActivity extends Activity {
    private static final String EXTRA_URL = "url";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_TYPE = "type";
    private static final String EXTRA_THEME = "theme";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Object pdfLock = new Object();

    private FrameLayout content;
    private LinearLayout pager;
    private TextView pageIndicator;
    private Button previousButton;
    private Button nextButton;
    private ZoomImageView pdfImage;
    private WebView webView;
    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor pdfDescriptor;
    private Bitmap currentBitmap;
    private int pageIndex;
    private boolean destroyed;
    private int backgroundColor;
    private int panelColor;
    private int borderColor;
    private int textColor;

    static void open(Context context, String url, String title, String type, String theme) {
        Intent intent = new Intent(context, DocumentViewerActivity.class)
                .putExtra(EXTRA_URL, url)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_TYPE, type)
                .putExtra(EXTRA_THEME, theme);
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = value(getIntent().getStringExtra(EXTRA_TITLE), "材料查看");
        String type = normalizeType(getIntent().getStringExtra(EXTRA_TYPE), url);
        boolean light = "light".equalsIgnoreCase(getIntent().getStringExtra(EXTRA_THEME));
        backgroundColor = Color.parseColor(light ? "#F6F7FB" : "#0F1115");
        panelColor = Color.parseColor(light ? "#FFFFFF" : "#151922");
        borderColor = Color.parseColor(light ? "#D1D5DB" : "#374151");
        textColor = Color.parseColor(light ? "#111827" : "#E7E7E7");
        getWindow().setStatusBarColor(backgroundColor);
        getWindow().setNavigationBarColor(backgroundColor);
        int systemUiFlags = light ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : 0;
        if (light && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systemUiFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        getWindow().getDecorView().setSystemUiVisibility(systemUiFlags);

        buildLayout(title);
        if (url == null || !url.startsWith("https://")) {
            showError("材料地址无效或不是 HTTPS");
            return;
        }

        if ("pdf".equals(type)) {
            loadPdf(url);
        } else {
            loadWebContent(url, "image".equals(type));
        }
    }

    private void buildLayout(String title) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(backgroundColor);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(
                    insets.getSystemWindowInsetLeft(),
                    insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(),
                    insets.getSystemWindowInsetBottom());
            return insets;
        });

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), dp(4), dp(8), dp(4));
        toolbar.setBackgroundColor(panelColor);

        Button back = button("返回");
        back.setOnClickListener(view -> finish());
        toolbar.addView(back, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(textColor);
        titleView.setTextSize(16);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setPadding(dp(8), 0, dp(8), 0);
        toolbar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));

        root.addView(toolbar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
        content = new FrameLayout(this);
        content.setBackgroundColor(backgroundColor);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        pager = new LinearLayout(this);
        pager.setGravity(Gravity.CENTER);
        pager.setPadding(dp(8), dp(6), dp(8), dp(6));
        pager.setBackgroundColor(panelColor);
        pager.setVisibility(View.GONE);

        previousButton = button("上一页");
        nextButton = button("下一页");
        previousButton.setOnClickListener(view -> renderPdfPage(pageIndex - 1));
        nextButton.setOnClickListener(view -> renderPdfPage(pageIndex + 1));
        pager.addView(previousButton, new LinearLayout.LayoutParams(dp(88), dp(42)));

        pageIndicator = new TextView(this);
        pageIndicator.setTextColor(textColor);
        pageIndicator.setGravity(Gravity.CENTER);
        pager.addView(pageIndicator, new LinearLayout.LayoutParams(dp(92), ViewGroup.LayoutParams.MATCH_PARENT));
        pager.addView(nextButton, new LinearLayout.LayoutParams(dp(88), dp(42)));
        root.addView(pager, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
        setContentView(root);
        root.requestApplyInsets();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void loadWebContent(String url, boolean image) {
        content.removeAllViews();
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(settings.getUserAgentString()
                + " MSYK-Android/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        ProgressBar progress = new ProgressBar(this);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(dp(44), dp(44), Gravity.CENTER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String loadedUrl) {
                progress.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("材料加载失败：" + error.getDescription());
            }
        });
        content.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        content.addView(progress, progressParams);

        if (image) {
            String escaped = escapeHtml(url);
            String html = "<!doctype html><html><head><meta name=\"viewport\" "
                    + "content=\"width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=8,user-scalable=yes\">"
                    + "<style>html,body{margin:0;width:100%;height:100%;background:" + colorHex(backgroundColor)
                    + ";overflow:auto}body{display:flex;align-items:center;justify-content:center}"
                    + "img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}</style>"
                    + "</head><body><img src=\"" + escaped + "\"></body></html>";
            webView.loadDataWithBaseURL(url, html, "text/html", StandardCharsets.UTF_8.name(), null);
        } else {
            webView.loadUrl(url);
        }
    }

    private void loadPdf(String url) {
        showLoading("正在下载 PDF...");
        executor.execute(() -> {
            try {
                File file = downloadPdf(url);
                synchronized (pdfLock) {
                    pdfDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                    pdfRenderer = new PdfRenderer(pdfDescriptor);
                }
                runOnUiThread(() -> {
                    if (destroyed) return;
                    pdfImage = new ZoomImageView(this);
                    content.removeAllViews();
                    content.addView(pdfImage, new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT));
                    pager.setVisibility(View.VISIBLE);
                    renderPdfPage(0);
                });
            } catch (Exception error) {
                runOnUiThread(() -> showError("PDF 加载失败：" + message(error)));
            }
        });
    }

    private void renderPdfPage(int requestedIndex) {
        PdfRenderer renderer = pdfRenderer;
        if (renderer == null || requestedIndex < 0 || requestedIndex >= renderer.getPageCount()) return;
        previousButton.setEnabled(false);
        nextButton.setEnabled(false);
        previousButton.setAlpha(.45f);
        nextButton.setAlpha(.45f);
        executor.execute(() -> {
            Bitmap bitmap = null;
            try {
                synchronized (pdfLock) {
                    if (pdfRenderer == null) return;
                    try (PdfRenderer.Page page = pdfRenderer.openPage(requestedIndex)) {
                        int targetWidth = Math.min(1800, Math.max(1080, getResources().getDisplayMetrics().widthPixels * 2));
                        int targetHeight = Math.max(1, Math.round(targetWidth * (page.getHeight() / (float) page.getWidth())));
                        if (targetHeight > 3072) {
                            targetWidth = Math.max(1, Math.round(targetWidth * (3072f / targetHeight)));
                            targetHeight = 3072;
                        }
                        bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
                        bitmap.eraseColor(Color.WHITE);
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    }
                }
                Bitmap rendered = bitmap;
                runOnUiThread(() -> displayPdfPage(rendered, requestedIndex));
            } catch (Exception error) {
                if (bitmap != null) bitmap.recycle();
                runOnUiThread(() -> showError("PDF 页面渲染失败：" + message(error)));
            }
        });
    }

    private void displayPdfPage(Bitmap bitmap, int index) {
        if (destroyed || pdfImage == null || pdfRenderer == null) {
            bitmap.recycle();
            return;
        }
        Bitmap previous = currentBitmap;
        currentBitmap = bitmap;
        pdfImage.setImageBitmap(bitmap);
        pdfImage.resetZoom();
        if (previous != null && previous != bitmap) previous.recycle();

        pageIndex = index;
        int count = pdfRenderer.getPageCount();
        pageIndicator.setText(String.format(Locale.ROOT, "%d / %d", index + 1, count));
        previousButton.setEnabled(index > 0);
        nextButton.setEnabled(index + 1 < count);
        previousButton.setAlpha(index > 0 ? 1f : .45f);
        nextButton.setAlpha(index + 1 < count ? 1f : .45f);
    }

    private File downloadPdf(String url) throws Exception {
        File directory = new File(getCacheDir(), "viewer-pdf");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("无法创建 PDF 缓存目录");
        File target = new File(directory, sha256(url) + ".pdf");
        if (target.isFile() && target.length() > 0) return target;

        File temporary = new File(directory, target.getName() + ".tmp");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "MSYK-Android/" + BuildConfig.VERSION_NAME);
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null && !cookie.trim().isEmpty()) connection.setRequestProperty("Cookie", cookie);
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new IllegalStateException("HTTP " + status);
        }
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
        } finally {
            connection.disconnect();
        }
        if (!temporary.renameTo(target)) {
            throw new IllegalStateException("PDF 缓存写入失败");
        }
        return target;
    }

    private void showLoading(String message) {
        content.removeAllViews();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        ProgressBar progress = new ProgressBar(this);
        TextView label = new TextView(this);
        label.setText(message);
        label.setTextColor(textColor);
        label.setPadding(0, dp(12), 0, 0);
        box.addView(progress, new LinearLayout.LayoutParams(dp(44), dp(44)));
        box.addView(label);
        content.addView(box, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void showError(String message) {
        if (destroyed) return;
        content.removeAllViews();
        TextView error = new TextView(this);
        error.setText(message);
        error.setTextColor(textColor);
        error.setTextSize(15);
        error.setGravity(Gravity.CENTER);
        error.setPadding(dp(24), dp(24), dp(24), dp(24));
        content.addView(error, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(textColor);
        button.setTextSize(13);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setStateListAnimator(null);
        GradientDrawable background = new GradientDrawable();
        background.setColor(panelColor);
        background.setCornerRadius(dp(8));
        background.setStroke(dp(1), borderColor);
        button.setBackground(background);
        return button;
    }

    @Override
    public void onBackPressed() {
        finish();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        executor.shutdownNow();
        synchronized (pdfLock) {
            if (pdfRenderer != null) pdfRenderer.close();
            if (pdfDescriptor != null) {
                try {
                    pdfDescriptor.close();
                } catch (Exception ignored) {
                }
            }
        }
        if (currentBitmap != null) currentBitmap.recycle();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String normalizeType(String type, String url) {
        String value = type == null ? "" : type.trim().toLowerCase(Locale.ROOT);
        if ("pdf".equals(value) || "image".equals(value) || "web".equals(value)) return value;
        String path = url == null ? "" : url.toLowerCase(Locale.ROOT).split("\\?", 2)[0];
        if (path.endsWith(".pdf")) return "pdf";
        if (path.matches(".*\\.(png|jpe?g|gif|webp|bmp)$")) return "image";
        return "web";
    }

    private static String value(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? error.toString() : error.getMessage();
    }

    private static String escapeHtml(String value) {
        return value.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private static String colorHex(int color) {
        return String.format(Locale.ROOT, "#%06X", 0xFFFFFF & color);
    }

    private static String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte item : digest) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return result.toString();
    }
}

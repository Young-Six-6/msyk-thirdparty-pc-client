package com.youngsix.msyk;

import android.content.Context;
import android.graphics.Color;
import android.util.AttributeSet;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.ImageView;

import androidx.annotation.Nullable;

final class ZoomImageView extends ImageView {
    private static final float MAX_SCALE = 5f;

    private final ScaleGestureDetector scaleDetector;
    private final GestureDetector gestureDetector;
    private float zoom = 1f;
    private float offsetX;
    private float offsetY;
    private float lastX;
    private float lastY;

    ZoomImageView(Context context) {
        this(context, null);
    }

    ZoomImageView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        setScaleType(ScaleType.FIT_CENTER);
        setBackgroundColor(Color.TRANSPARENT);
        setClickable(true);

        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                zoom = clamp(zoom * detector.getScaleFactor(), 1f, MAX_SCALE);
                if (zoom == 1f) {
                    offsetX = 0f;
                    offsetY = 0f;
                }
                applyTransform();
                return true;
            }
        });
        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDoubleTap(MotionEvent event) {
                zoom = zoom > 1f ? 1f : 2.5f;
                if (zoom == 1f) {
                    offsetX = 0f;
                    offsetY = 0f;
                }
                applyTransform();
                return true;
            }
        });
    }

    void resetZoom() {
        zoom = 1f;
        offsetX = 0f;
        offsetY = 0f;
        applyTransform();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        getParent().requestDisallowInterceptTouchEvent(event.getPointerCount() > 1 || zoom > 1f);
        scaleDetector.onTouchEvent(event);
        gestureDetector.onTouchEvent(event);

        if (!scaleDetector.isInProgress()) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    lastX = event.getX();
                    lastY = event.getY();
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (zoom > 1f && event.getPointerCount() == 1) {
                        offsetX += event.getX() - lastX;
                        offsetY += event.getY() - lastY;
                        lastX = event.getX();
                        lastY = event.getY();
                        applyTransform();
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    performClick();
                    break;
                default:
                    break;
            }
        }
        return true;
    }

    @Override
    public boolean performClick() {
        super.performClick();
        return true;
    }

    private void applyTransform() {
        float maxX = Math.max(0f, getWidth() * (zoom - 1f) / 2f);
        float maxY = Math.max(0f, getHeight() * (zoom - 1f) / 2f);
        offsetX = clamp(offsetX, -maxX, maxX);
        offsetY = clamp(offsetY, -maxY, maxY);
        setScaleX(zoom);
        setScaleY(zoom);
        setTranslationX(offsetX);
        setTranslationY(offsetY);
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}

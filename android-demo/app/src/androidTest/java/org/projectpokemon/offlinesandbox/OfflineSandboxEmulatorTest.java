package org.projectpokemon.offlinesandbox;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/**
 * Real Android emulator + real system WebView check. No test assets injected into
 * the production APK. No online game bytes, saves, or reward APIs accessed.
 */
@RunWith(AndroidJUnit4.class)
public final class OfflineSandboxEmulatorTest {
    private final Instrumentation instrumentation =
            InstrumentationRegistry.getInstrumentation();

    private String eval(WebView view, String source) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() ->
                view.evaluateJavascript(source, value -> {
                    result.set(value);
                    done.countDown();
                }));
        assertTrue("WebView Javascript callback timed out: " + source,
                done.await(12, TimeUnit.SECONDS));
        return result.get();
    }

    private void until(WebView view, String expression, long timeoutMs) throws Exception {
        long expiry = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < expiry) {
            if ("true".equals(eval(view, expression))) return;
            Thread.sleep(300);
        }
        fail("Offline WebView condition never became true: " + expression);
    }

    private void sendTouch(long down, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(),
                action, x, y, 0);
        try {
            instrumentation.sendPointerSync(event);
        } finally {
            event.recycle();
        }
    }

    @Test
    public void realAndroidWebViewLoadsAndRunsEntirelyOffline() throws Exception {
        assertEquals("Emulator must be in airplane mode before test starts",
                1, Settings.Global.getInt(
                        instrumentation.getTargetContext().getContentResolver(),
                        Settings.Global.AIRPLANE_MODE_ON, 0));

        PackageManager manager = instrumentation.getTargetContext().getPackageManager();
        PackageInfo info = manager.getPackageInfo("org.projectpokemon.offlinesandbox",
                PackageManager.GET_PERMISSIONS);
        if (info.requestedPermissions != null) {
            for (String permission : info.requestedPermissions) {
                assertNotEquals("No INTERNET permission allowed",
                        "android.permission.INTERNET", permission);
                assertNotEquals("No ACCESS_NETWORK_STATE permission allowed",
                        "android.permission.ACCESS_NETWORK_STATE", permission);
            }
        }

        Intent intent = new Intent(instrumentation.getTargetContext(),
                OfflineSandboxActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        assertNotNull(activity);
        try {
            instrumentation.waitForIdleSync();
            ViewGroup root = activity.findViewById(android.R.id.content);
            assertNotNull(root);
            assertTrue("Real Activity must contain a WebView",
                    root.getChildAt(0) instanceof WebView);
            WebView web = (WebView) root.getChildAt(0);

            until(web, "document.readyState==='complete' && " +
                    "!!window.PokeBonkOfflineDemo && " +
                    "!!document.getElementById('start') && " +
                    "!!document.getElementById('arena')", 30000);
            assertEquals("Offline URL must use asset loader (not pokebonk.com)",
                    "https://appassets.androidplatform.net/assets/index.html",
                    web.getUrl());

            assertEquals("true", eval(web,
                    "document.getElementById('start').click();true"));
            until(web, "document.getElementById('status').textContent." +
                    "includes('State: running')", 9000);
            assertEquals("true", eval(web, "(function(){" +
                    "const p=document.getElementById('arena').getContext('2d')" +
                    ".getImageData(480,270,1,1).data;" +
                    "return p[3]===255&&p[0]===94&&p[1]===234&&p[2]===212" +
                    "})()"));

            // Inject a real touch drag through Android's input dispatcher,
            // then examine the actual canvas pixels for the player displacement.
            final String playerPixel = "(function(){" +
                    "const d=document.getElementById('arena').getContext('2d')" +
                    ".getImageData(0,270,960,1).data;" +
                    "for(let x=0;x<960;x++){let i=x*4;" +
                    "if(d[i]===94&&d[i+1]===234&&d[i+2]===212)return x;}" +
                    "return -1})()";
            int before = Integer.parseInt(eval(web, playerPixel));
            assertTrue("Player should be drawn in real Android canvas", before > 450);
            JSONArray bounds = new JSONArray(eval(web,
                    "(function(){const r=document.getElementById('arena')" +
                    ".getBoundingClientRect();" +
                    "return [r.left,r.top,r.width,r.height,window.innerWidth,window.innerHeight]" +
                    "})()"));
            int[] screenOrigin = new int[2];
            int[] pixels = new int[2];
            instrumentation.runOnMainSync(() -> {
                web.getLocationOnScreen(screenOrigin);
                pixels[0] = web.getWidth();
                pixels[1] = web.getHeight();
            });
            double scaleX = pixels[0] / bounds.getDouble(4);
            double scaleY = pixels[1] / bounds.getDouble(5);
            float startX = (float) (screenOrigin[0] +
                    (bounds.getDouble(0) + bounds.getDouble(2) * .17) * scaleX);
            float startY = (float) (screenOrigin[1] +
                    (bounds.getDouble(1) + bounds.getDouble(3) * .48) * scaleY);
            float endX = (float) (startX + bounds.getDouble(2) * .12 * scaleX);
            long down = SystemClock.uptimeMillis();
            sendTouch(down, MotionEvent.ACTION_DOWN, startX, startY);
            Thread.sleep(120);
            sendTouch(down, MotionEvent.ACTION_MOVE, endX, startY);
            Thread.sleep(900);
            sendTouch(down, MotionEvent.ACTION_UP, endX, startY);
            int after = Integer.parseInt(eval(web, playerPixel));
            assertTrue("Touch drag must move cyan player pixels right: " +
                    before + " -> " + after, after >= before + 5);

            assertEquals("true", eval(web,
                    "document.getElementById('pause').click();true"));
            until(web, "document.getElementById('status').textContent." +
                    "includes('State: paused')", 5000);
            assertEquals("true", eval(web,
                    "document.getElementById('pause').click();true"));
            until(web, "document.getElementById('status').textContent." +
                    "includes('State: running')", 5000);
            assertEquals("true", eval(web,
                    "document.getElementById('status').textContent.includes('Rewards 0')"));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}

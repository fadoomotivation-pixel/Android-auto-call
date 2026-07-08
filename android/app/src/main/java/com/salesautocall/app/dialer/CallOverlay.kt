package com.salesautocall.app.dialer

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.OnBackPressedDispatcherOwner
import androidx.activity.setViewTreeOnBackPressedDispatcherOwner
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.salesautocall.app.MainActivity
import com.salesautocall.app.ui.AppTheme
import com.salesautocall.app.ui.SimCallScreen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Draws the in-app call cockpit in a SYSTEM OVERLAY window that floats ABOVE the
 * phone's own in-call screen — the same trick Truecaller / O-Dialer use to keep
 * the call "inside their app" WITHOUT being the default dialer. It only needs the
 * "Display over other apps" permission (SYSTEM_ALERT_WINDOW). If that isn't
 * granted we fall back to the in-Activity screen + best-effort bring-to-front.
 *
 * Behaviour, driven purely by SimCallMonitor.state:
 *   • call active, not minimized → overlay covers the screen (over the dialer)
 *   • minimized                  → overlay removed, the CRM is brought forward so
 *                                  its floating chip shows (rep browses leads)
 *   • call ended                 → overlay removed
 */
object CallOverlay {

    private val main = Handler(Looper.getMainLooper())
    private var view: ComposeView? = null
    private var owner: OverlayOwner? = null
    private var started = false

    /** True when we're allowed to draw over other apps (always true pre-M). */
    fun canDraw(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    /** Intent that opens this app's "Display over other apps" settings page. */
    fun permissionIntent(context: Context): Intent =
        Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:${context.packageName}"),
        )

    /** Wire the overlay to the live call once — called from Application.onCreate. */
    fun init(context: Context) {
        if (started) return
        started = true
        val app = context.applicationContext
        CoroutineScope(Dispatchers.Main).launch {
            SimCallMonitor.state
                .map { ui -> if (ui == null) "gone" else if (ui.minimized) "mini" else "full" }
                .distinctUntilChanged()
                .collect { mode ->
                    when (mode) {
                        "gone" -> hide()
                        "mini" -> { hide(); bringAppToFront(app) }
                        else -> show(app)
                    }
                }
        }
    }

    @SuppressLint("InflateParams")
    private fun show(context: Context) {
        main.post {
            if (view != null) return@post
            if (!canDraw(context)) return@post // fall back to the in-Activity screen
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val o = OverlayOwner().apply { create(); resume() }
            val cv = ComposeView(context).apply {
                setViewTreeLifecycleOwner(o)
                setViewTreeViewModelStoreOwner(o)
                setViewTreeSavedStateRegistryOwner(o)
                setViewTreeOnBackPressedDispatcherOwner(o)
                setContent { AppTheme { SimCallScreen() } }
            }
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT,
            )
            runCatching { wm.addView(cv, params) }
                .onSuccess { view = cv; owner = o }
                .onFailure { o.destroy() }
        }
    }

    private fun hide() {
        main.post {
            val cv = view ?: return@post
            runCatching {
                (cv.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(cv)
            }
            owner?.destroy()
            view = null
            owner = null
        }
    }

    private fun bringAppToFront(context: Context) {
        runCatching {
            context.startActivity(
                Intent(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            )
        }
    }
}

/** Minimal owner so a window-hosted ComposeView has lifecycle / state / back. */
private class OverlayOwner : LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner, OnBackPressedDispatcherOwner {
    private val registry = LifecycleRegistry(this)
    private val savedState = SavedStateRegistryController.create(this).apply { performRestore(null) }
    override val lifecycle: Lifecycle get() = registry
    override val viewModelStore = ViewModelStore()
    override val savedStateRegistry: SavedStateRegistry get() = savedState.savedStateRegistry
    override val onBackPressedDispatcher = OnBackPressedDispatcher()
    fun create() { registry.currentState = Lifecycle.State.CREATED }
    fun resume() { registry.currentState = Lifecycle.State.RESUMED }
    fun destroy() { registry.currentState = Lifecycle.State.DESTROYED; viewModelStore.clear() }
}

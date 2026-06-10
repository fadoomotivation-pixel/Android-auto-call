package com.salesautocall.app.ui

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/** Full-screen in-app softphone: a hidden WebView runs SIP.js (registers as the
 *  agent and auto-answers), with a simple call UI on top. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SoftphoneScreen(vm: MainViewModel) {
    val app by vm.state.collectAsState()
    val number = app.cloudCallNumber ?: return
    val context = LocalContext.current
    var pageLoaded by remember { mutableStateOf(false) }
    var registered by remember { mutableStateOf(false) }

    val webView = remember {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    request.grant(request.resources)
                }
            }
            addJavascriptInterface(
                object {
                    @JavascriptInterface
                    fun onStatus(s: String) {
                        vm.onSoftphoneStatus(s)
                    }
                },
                "Android",
            )
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    pageLoaded = true
                }
            }
            // Served over https so WebRTC getUserMedia has a secure context.
            loadUrl("https://android-auto-call.vercel.app/softphone.html")
        }
    }

    // Register once the page is loaded AND credentials are fetched from uroperator.
    LaunchedEffect(pageLoaded, app.cloudCallExt, app.cloudCallPass) {
        if (pageLoaded && !registered && app.cloudCallExt.isNotBlank() && app.cloudCallPass.isNotBlank()) {
            registered = true
            val js = "appRegister(" +
                "'${app.cloudCallExt}'," +
                "'${app.cloudCallPass}'," +
                "'${app.cloudCallWss.ifBlank { "wss://sip.uroperator.com:8843" }}'," +
                "'${app.cloudCallDomain.ifBlank { "sip.uroperator.com" }}')"
            webView.evaluateJavascript(js, null)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { webView.evaluateJavascript("appHangup()", null) }
            runCatching { webView.destroy() }
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Cloud call", style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Text(number, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            Text(
                app.cloudCallStatus.ifBlank { "Connecting…" },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(40.dp))
            Button(
                onClick = {
                    runCatching { webView.evaluateJavascript("appHangup()", null) }
                    vm.endCloudCall()
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD7263D)),
            ) { Text("Hang up") }

            // Hidden audio-only WebView.
            AndroidView(factory = { webView }, modifier = Modifier.size(1.dp))
        }
    }
}

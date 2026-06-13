package com.salesautocall.app.ui

import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.salesautocall.app.data.Repository
import kotlinx.coroutines.delay
import java.util.concurrent.TimeUnit

@OptIn(UnstableApi::class)
@Composable
fun AudioPlayer(
    callLogId: String,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var isPlaying by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var buffering by remember { mutableStateOf(true) }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            val token = Repository.getSessionToken() ?: ""
            val functionsUrl = Repository.getFunctionsUrl()
            
            // Create a factory that intercepts the DataSpec to inject the POST body and Auth headers
            val baseFactory = DefaultHttpDataSource.Factory()
            val resolvingFactory = ResolvingDataSource.Factory(baseFactory, ResolvingDataSource.Resolver { dataSpec ->
                dataSpec.buildUpon()
                    .setHttpMethod(DataSpec.HTTP_METHOD_POST)
                    .setHttpBody("""{"call_log_id":"$callLogId"}""".toByteArray())
                    .setHttpRequestHeaders(mapOf("Authorization" to "Bearer $token"))
                    .build()
            })

            val mediaSource = ProgressiveMediaSource.Factory(resolvingFactory)
                .createMediaSource(MediaItem.fromUri(Uri.parse("$functionsUrl/recording-url")))
            
            setMediaSource(mediaSource)
            prepare()
            
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) {
                    isPlaying = playing
                }
                override fun onPlaybackStateChanged(playbackState: Int) {
                    buffering = playbackState == Player.STATE_BUFFERING
                    if (playbackState == Player.STATE_READY) {
                        duration = this@apply.duration.coerceAtLeast(0L)
                    }
                }
            })
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                exoPlayer.pause()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            exoPlayer.release()
        }
    }

    LaunchedEffect(isPlaying) {
        while (isPlaying) {
            currentPosition = exoPlayer.currentPosition
            delay(500)
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = {
            if (isPlaying) exoPlayer.pause() else exoPlayer.play()
        }) {
            if (buffering) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play"
                )
            }
        }

        Slider(
            value = if (duration > 0) currentPosition.toFloat() / duration.toFloat() else 0f,
            onValueChange = { percent ->
                if (duration > 0) {
                    val newPos = (percent * duration.toFloat()).toLong()
                    exoPlayer.seekTo(newPos)
                    currentPosition = newPos
                }
            },
            modifier = Modifier.weight(1f).padding(horizontal = 8.dp)
        )

        Text(
            text = formatTime(currentPosition) + " / " + formatTime(duration),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun formatTime(ms: Long): String {
    val totalSeconds = TimeUnit.MILLISECONDS.toSeconds(ms)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%02d:%02d", minutes, seconds)
}

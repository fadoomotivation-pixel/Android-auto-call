package com.salesautocall.app.ui

import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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

/**
 * A CALL RECORDING PLAYS FOR ONE PERSON: THE TELECALLER WHO MADE THE CALL.
 *
 * The database has always allowed more than that — an admin can read every
 * call_log in their company and the platform owner can read all of them, which
 * is right for the web dashboard and wrong for a handset. A phone gets left on
 * a desk, handed to a colleague, taken home. A OnePlus signed in with an admin
 * account was two taps away from every recorded conversation in the company.
 *
 * So the phone draws a tighter line than the database does. [callOwnerId] is
 * the salesperson_id of the call, and it is REQUIRED — not defaulted — because
 * the next screen that wants to play a recording must be made to answer the
 * question rather than quietly inherit a yes.
 *
 * The web is untouched: callproai.in is where a founder reviews calls, behind
 * a login on a machine they control.
 */
@OptIn(UnstableApi::class)
@Composable
fun AudioPlayer(
    callLogId: String,
    /** salesperson_id of the call. Only this person hears it on a phone. */
    callOwnerId: String?,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Checked BEFORE the player is built, so a recording the listener may not
    // hear is never even requested from the server.
    val mine = remember(callOwnerId) {
        val me = Repository.currentUserId()
        !me.isNullOrBlank() && me == callOwnerId
    }
    if (!mine) {
        Row(
            modifier.padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "🔒 Recording only opens for the telecaller who made this call.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    var isPlaying by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var buffering by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val token = remember { Repository.getSessionToken() }

    val exoPlayer = remember {
        if (token.isNullOrBlank()) {
            errorMessage = "Session expired. Please sign in again."
            null
        } else {
            ExoPlayer.Builder(context).build().apply {
                val functionsUrl = Repository.getFunctionsUrl()

                val baseFactory = DefaultHttpDataSource.Factory()
                val resolvingFactory = ResolvingDataSource.Factory(baseFactory, ResolvingDataSource.Resolver { dataSpec ->
                    dataSpec.buildUpon()
                        .setHttpMethod(DataSpec.HTTP_METHOD_POST)
                        // surface:"android" tells the server this is a handset,
                        // where only the call's own rep may listen. See the
                        // header of supabase/functions/recording-url.
                        .setHttpBody("""{"call_log_id":"$callLogId","surface":"android"}""".toByteArray())
                        .setHttpRequestHeaders(mapOf("Authorization" to "Bearer $token"))
                        .build()
                })

                val mediaSource = ProgressiveMediaSource.Factory(resolvingFactory)
                    .createMediaSource(MediaItem.fromUri(Uri.parse("$functionsUrl/recording-url")))

                setMediaSource(mediaSource)
                prepare()
                // The user tapped Play to open this control — start as soon as ready.
                playWhenReady = true

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
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        errorMessage = "Recording not available"
                        buffering = false
                    }
                })
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                exoPlayer?.pause()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            exoPlayer?.release()
        }
    }

    LaunchedEffect(isPlaying) {
        while (isPlaying) {
            currentPosition = exoPlayer?.currentPosition ?: 0L
            delay(500)
        }
    }

    if (errorMessage != null) {
        Text(
            text = errorMessage ?: "",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = modifier.fillMaxWidth().padding(vertical = 8.dp)
        )
        return
    }

    // A calm pill: a filled circular play/pause, a slim progress bar, and the
    // elapsed / total time underneath — reads like a proper voice-message player.
    Surface(
        modifier = modifier.fillMaxWidth().padding(vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.07f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(42.dp),
            ) {
                IconButton(onClick = { exoPlayer?.let { if (isPlaying) it.pause() else it.play() } }) {
                    if (buffering) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp), strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                Slider(
                    value = if (duration > 0) currentPosition.toFloat() / duration.toFloat() else 0f,
                    onValueChange = { percent ->
                        if (duration > 0) {
                            val newPos = (percent * duration.toFloat()).toLong()
                            exoPlayer?.seekTo(newPos)
                            currentPosition = newPos
                        }
                    },
                    colors = SliderDefaults.colors(
                        thumbColor = MaterialTheme.colorScheme.primary,
                        activeTrackColor = MaterialTheme.colorScheme.primary,
                        inactiveTrackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
                    ),
                    modifier = Modifier.fillMaxWidth().height(24.dp),
                )
                Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatTime(currentPosition), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(formatTime(duration), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

private fun formatTime(ms: Long): String {
    val totalSeconds = TimeUnit.MILLISECONDS.toSeconds(ms)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%02d:%02d", minutes, seconds)
}

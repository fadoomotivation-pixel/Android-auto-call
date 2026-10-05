package com.salesautocall.app.dialer

import com.salesautocall.app.data.CallLog

/**
 * What this phone actually captured, said in one or two short sentences.
 *
 * A harvest miss used to be logged as recording_status "none", which reads as
 * "no recording was expected". A speaker or microphone file used to be logged
 * as source "sim", the same value as the phone's own recorder. Both looked
 * like a clean call. These sentences name the gap. They never invent audio.
 */
object RecordingTruth {

    const val MIN_SEC = 3

    /** The phone's own recorder file (OEM folder harvest, or a verified voice-call stream). */
    const val SOURCE_SIM = "sim"
    /** Loudspeaker fallback. The mic heard the call because the speaker was on. */
    const val SOURCE_SPEAKER = "sim_speaker"
    /** Microphone fallback. Last resort, not the phone's own file. */
    const val SOURCE_MIC = "sim_mic"
    /** App recorder used because the OEM folder had no file for this call. */
    const val SOURCE_APP = "sim_app"

    const val KIND_VOICE = "voice_call"
    const val KIND_SPEAKER = "speaker"
    const val KIND_MIC = "mic"

    const val HARVEST_MISS =
        "No recording file. The phone's recorder folder had nothing for this call."
    const val NO_FILE = "No recording saved for this call."
    const val SPEAKER = "Speaker recording. Not the phone's own call file."
    const val MIC = "Microphone recording. Not the phone's own call file."
    const val APP_FALLBACK = "App recording. The phone's own file was not found."
    const val BROKEN = "Recording file is broken. It cannot play."
    const val UPLOAD_FAILED = "Recording did not upload."

    data class Capture(
        val path: String? = null,
        /** Stored on call_logs.recording_source and sent as x-source. */
        val source: String? = null,
        val status: String = "none",
        /** Stored on call_logs.recording_error when the call has no file. */
        val error: String? = null,
        /** Shown on the outcome bar immediately, before the row is fetched back. */
        val warning: String? = null,
    )

    fun none() = Capture()

    /**
     * @param nativeFolder the OEM recording folder is configured and recording is on
     * @param micKind [KIND_VOICE], [KIND_SPEAKER], [KIND_MIC], or null when no app file exists
     */
    fun classify(
        recordingOn: Boolean,
        nativeFolder: Boolean,
        durationSec: Int,
        harvestPath: String?,
        micPath: String?,
        micKind: String?,
    ): Capture {
        if (!recordingOn) return none()
        val harvest = harvestPath?.takeIf { it.isNotBlank() }
        val mic = micPath?.takeIf { it.isNotBlank() }
        if (nativeFolder && durationSec >= MIN_SEC) {
            if (harvest != null) return file(harvest, SOURCE_SIM, null)
            if (mic != null) {
                val (source, warning) = fallback(micKind, harvestMissed = true)
                return file(mic, source, warning)
            }
            return failed(HARVEST_MISS)
        }
        if (mic != null) {
            val (source, warning) = fallback(micKind, harvestMissed = false)
            return file(mic, source, warning)
        }
        if (durationSec >= MIN_SEC) return failed(NO_FILE)
        return none()
    }

    fun withUploadFailure(warning: String?): String {
        if (warning.isNullOrBlank()) return UPLOAD_FAILED
        if (warning.contains(UPLOAD_FAILED)) return warning
        return "$warning $UPLOAD_FAILED"
    }

    /** Server fields the phone can already fetch. Null when nothing is wrong, or not yet known. */
    fun warningFor(call: CallLog): String? = warningFor(
        recordingStatus = call.recordingStatus,
        recordingSource = call.recordingSource,
        recordingError = call.recordingError,
        audioSeconds = call.audioSeconds,
        audioComplete = call.audioComplete,
        durationSeconds = call.durationSeconds,
    )

    fun warningFor(
        recordingStatus: String,
        recordingSource: String?,
        recordingError: String?,
        audioSeconds: Int?,
        audioComplete: Boolean?,
        durationSeconds: Int,
    ): String? {
        val fallback = when (recordingSource) {
            SOURCE_SPEAKER -> SPEAKER
            SOURCE_MIC -> MIC
            SOURCE_APP -> APP_FALLBACK
            else -> null
        }
        // A failed row already carries the full sentence (harvest miss, or
        // fallback plus "did not upload"). Prepending the source line again
        // would say it twice.
        if (recordingStatus == "failed") {
            return recordingError?.takeIf { it.isNotBlank() } ?: fallback ?: NO_FILE
        }
        // Same short-audio rule as v_broken_recordings: under a fifth of a call
        // longer than 30s. A recorder that starts a second late is normal.
        // audio_seconds is only printed when the server actually measured it.
        val problem = when {
            audioComplete == false -> BROKEN
            audioSeconds != null && durationSeconds > 30 &&
                audioSeconds < durationSeconds * 0.2 ->
                "Recording is only ${talk(audioSeconds)}. The call was ${talk(durationSeconds)}."
            else -> null
        }
        return when {
            fallback != null && problem != null -> "$fallback $problem"
            problem != null -> problem
            else -> fallback
        }
    }

    private fun file(path: String, source: String, warning: String?) = Capture(
        path = path,
        source = source,
        status = "uploading",
        warning = warning,
    )

    private fun failed(warning: String) = Capture(
        status = "failed",
        error = warning,
        warning = warning,
    )

    /** Speaker and mic are always named. A verified voice-call stream is named only when it replaced a missed OEM file. */
    private fun fallback(kind: String?, harvestMissed: Boolean): Pair<String, String?> = when (kind) {
        KIND_SPEAKER -> SOURCE_SPEAKER to SPEAKER
        KIND_MIC -> SOURCE_MIC to MIC
        else -> if (harvestMissed) SOURCE_APP to APP_FALLBACK else SOURCE_SIM to null
    }

    private fun talk(seconds: Int): String =
        if (seconds >= 60) "${seconds / 60}m ${seconds % 60}s" else "${seconds}s"
}

@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.salesautocall.app.ui

import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.delay

/**
 * Swipe-down-to-refresh, the way every phone app trains your thumb to expect.
 * Wraps any scrollable content; [onRefresh] fires the reloads (they're
 * fire-and-forget in the ViewModel) and the spinner shows just long enough to
 * feel responsive without needing per-source loading plumbing.
 */
@Composable
fun Refreshable(
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(refreshing) {
        if (refreshing) {
            delay(1000)
            refreshing = false
        }
    }
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            onRefresh()
        },
        modifier = modifier,
        content = content,
    )
}

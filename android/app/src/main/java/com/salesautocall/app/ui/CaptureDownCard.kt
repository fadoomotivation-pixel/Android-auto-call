package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.AppType
import com.salesautocall.app.ui.design.Radii
import com.salesautocall.app.ui.design.Space

/**
 * In the page, not over it. A sticky card is how the admin strip covered the
 * Lead Management title. This one scrolls with the list.
 *
 * No button. The phone has no QR screen, and fetching one would call the
 * Baileys worker. The sentence tells her to ask her manager.
 */
@Composable
fun CaptureDownCard(title: String, detail: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(Radii.card)
            .background(AppColors.DangerSoft)
            .border(1.dp, AppColors.Danger.copy(alpha = 0.35f), Radii.card)
            .padding(Space.l),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Outlined.Warning,
                contentDescription = null,
                tint = AppColors.Danger,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(title, style = AppType.rowTitle, color = AppColors.TextPrimary)
        }
        Spacer(Modifier.size(6.dp))
        Text(detail, style = AppType.meta, color = AppColors.TextSecondary)
    }
}

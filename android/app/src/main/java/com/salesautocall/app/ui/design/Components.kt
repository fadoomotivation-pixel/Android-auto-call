package com.salesautocall.app.ui.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.abs

/**
 * Shared UI primitives. Every screen composes from these so the whole app reads
 * as one product. Pure presentation — callers keep owning state and logic.
 */

// ── Screen scaffolding ────────────────────────────────────────────

@Composable
fun AppScreen(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .fillMaxSize()
            .background(AppColors.Canvas),
    ) { content() }
}

@Composable
fun ScreenHeader(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.gutter, vertical = Space.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            Box(
                Modifier
                    .size(Space.touch)
                    .clip(CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = AppColors.TextPrimary,
                )
            }
            Spacer(Modifier.width(Space.xs))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = AppType.title, color = AppColors.TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing?.invoke()
    }
}

@Composable
fun SectionLabel(
    text: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.gutter, vertical = Space.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text.uppercase(),
            style = AppType.sectionLabel,
            color = AppColors.TextTertiary,
            modifier = Modifier.weight(1f),
        )
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel,
                style = AppType.label,
                color = AppColors.Indigo,
                modifier = Modifier
                    .clip(Radii.tag)
                    .clickable { onAction() }
                    .padding(horizontal = Space.s, vertical = Space.xs),
            )
        }
    }
}

/** Hairline divider that respects the list inset. */
@Composable
fun HairLine(inset: Boolean = true) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(start = if (inset) Space.gutter else 0.dp)
            .height(1.dp)
            .background(AppColors.Border),
    )
}

/** Grouped white container with a hairline outline — used sparingly. */
@Composable
fun AppSurface(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(Space.l),
    content: @Composable () -> Unit,
) {
    val base = modifier
        .fillMaxWidth()
        .clip(Radii.card)
        .background(AppColors.Surface)
        .border(1.dp, AppColors.Border, Radii.card)
    Box((if (onClick != null) base.clickable { onClick() } else base).padding(padding)) {
        content()
    }
}

// ── Tags & badges ────────────────────────────────────────────────

@Composable
fun StatusTag(text: String, tone: StatusTone) {
    Box(
        Modifier
            .clip(Radii.tag)
            .background(tone.bg)
            .padding(horizontal = Space.s, vertical = 3.dp),
    ) {
        Text(text, style = AppType.tag, color = tone.fg, maxLines = 1)
    }
}

@Composable
fun MetaTag(text: String, fg: Color = AppColors.TextSecondary, bg: Color = AppColors.SurfaceMuted) {
    Box(
        Modifier
            .clip(Radii.tag)
            .background(bg)
            .padding(horizontal = Space.s, vertical = 3.dp),
    ) {
        Text(text, style = AppType.tag, color = fg, maxLines = 1)
    }
}

// ── Avatar ───────────────────────────────────────────────────────

@Composable
fun InitialsAvatar(name: String, size: Int = 40) {
    val initials = name.trim().split(' ', '.', '-')
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { "?" }
    val idx = abs(name.hashCode()) % AppColors.avatarTints.size
    Box(
        Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(AppColors.avatarTints[idx]),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, style = AppType.metaStrong, color = AppColors.avatarInk[idx])
    }
}

// ── Buttons ──────────────────────────────────────────────────────

@Composable
fun PrimaryButton(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier
            .heightIn(min = Space.touch)
            .clip(Radii.control)
            .background(if (enabled) AppColors.Indigo else AppColors.SurfaceMuted)
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = Space.l),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = if (enabled) AppColors.OnIndigo else AppColors.TextTertiary, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(Space.s))
        }
        Text(text, style = AppType.label, color = if (enabled) AppColors.OnIndigo else AppColors.TextTertiary)
    }
}

@Composable
fun SecondaryButton(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    tint: Color = AppColors.TextPrimary,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier
            .heightIn(min = Space.touch)
            .clip(Radii.control)
            .background(AppColors.Surface)
            .border(1.dp, AppColors.Border, Radii.control)
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = Space.l),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(Space.s))
        }
        Text(text, style = AppType.label, color = tint)
    }
}

@Composable
fun GhostButton(
    text: String,
    modifier: Modifier = Modifier,
    tint: Color = AppColors.Indigo,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .heightIn(min = 40.dp)
            .clip(Radii.control)
            .clickable { onClick() }
            .padding(horizontal = Space.m),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = AppType.label, color = tint)
    }
}

/** Circular icon action used in list rows (call, whatsapp, more). */
@Composable
fun RoundIconButton(
    icon: ImageVector,
    contentDescription: String,
    tint: Color = AppColors.Indigo,
    background: Color = AppColors.IndigoSoft,
    size: Int = 40,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(background)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription, tint = tint, modifier = Modifier.size((size * 0.45f).dp))
    }
}

// ── Inputs ───────────────────────────────────────────────────────

@Composable
fun AppSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "Search",
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = Space.touch)
            .clip(Radii.control)
            .background(AppColors.SurfaceMuted)
            .padding(horizontal = Space.m),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Search, null, tint = AppColors.TextTertiary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Space.s))
        androidx.compose.foundation.text.BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = AppType.body.copy(color = AppColors.TextPrimary),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(AppColors.Indigo),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text(placeholder, style = AppType.body, color = AppColors.TextTertiary)
                }
                inner()
            },
        )
    }
}

@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column(modifier.fillMaxWidth()) {
        Text(label, style = AppType.meta, color = AppColors.TextSecondary)
        Spacer(Modifier.height(Space.xs))
        TextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            textStyle = LocalTextStyle.current.merge(AppType.body),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = AppColors.SurfaceMuted,
                unfocusedContainerColor = AppColors.SurfaceMuted,
                disabledContainerColor = AppColors.SurfaceMuted,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                disabledIndicatorColor = Color.Transparent,
                cursorColor = AppColors.Indigo,
            ),
            shape = Radii.control,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ── Tabs ─────────────────────────────────────────────────────────

/** Scrollable filter tabs (leads statuses, follow-up views). */
@Composable
fun ScrollableTabs(
    tabs: List<String>,
    selected: String,
    counts: Map<String, Int> = emptyMap(),
    onSelect: (String) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = Space.gutter),
        horizontalArrangement = Arrangement.spacedBy(Space.s),
    ) {
        tabs.forEach { tab ->
            val active = tab == selected
            Row(
                Modifier
                    .clip(Radii.tag)
                    .background(if (active) AppColors.TextPrimary else AppColors.SurfaceMuted)
                    .clickable { onSelect(tab) }
                    .padding(horizontal = Space.m, vertical = Space.s),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    tab,
                    style = AppType.label,
                    color = if (active) AppColors.Surface else AppColors.TextSecondary,
                )
                counts[tab]?.takeIf { it > 0 }?.let {
                    Spacer(Modifier.width(Space.xs))
                    Text(
                        it.toString(),
                        style = AppType.tag,
                        color = if (active) AppColors.Surface.copy(alpha = 0.75f) else AppColors.TextTertiary,
                    )
                }
            }
        }
    }
}

/** Two-to-four option segmented control (e.g. SIM / Cloud). */
@Composable
fun SegmentedTabs(
    options: List<String>,
    selectedIndex: Int,
    modifier: Modifier = Modifier,
    onSelect: (Int) -> Unit,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radii.control)
            .background(AppColors.SurfaceMuted)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEachIndexed { index, option ->
            val active = index == selectedIndex
            Box(
                Modifier
                    .weight(1f)
                    .clip(Radii.control)
                    .background(if (active) AppColors.Surface else Color.Transparent)
                    .clickable { onSelect(index) }
                    .padding(vertical = Space.s + Space.xxs),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    option,
                    style = AppType.label,
                    color = if (active) AppColors.TextPrimary else AppColors.TextSecondary,
                )
            }
        }
    }
}

// ── Metrics ──────────────────────────────────────────────────────

/** Quiet metric block — value first, label beneath. No emoji, no card. */
@Composable
fun StatBlock(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Color = AppColors.TextPrimary,
) {
    Column(modifier) {
        Text(value, style = AppType.metric, color = accent, maxLines = 1)
        Text(label, style = AppType.meta, color = AppColors.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ── AI surfaces ──────────────────────────────────────────────────

/**
 * The single visual identity for AI anywhere in the app: a soft indigo panel
 * with a spark mark. Used for AI summaries, suggested next steps and insights.
 */
@Composable
fun AiPanel(
    title: String,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    footer: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(Radii.card)
            .background(AppColors.IndigoSoft)
            .padding(Space.l),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.AutoAwesome, null, tint = AppColors.Indigo, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(Space.s))
            Text(title.uppercase(), style = AppType.sectionLabel, color = AppColors.Indigo, modifier = Modifier.weight(1f))
            if (loading) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    color = AppColors.Indigo,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
        Spacer(Modifier.height(Space.s))
        content()
        if (footer != null) {
            Spacer(Modifier.height(Space.m))
            footer()
        }
    }
}

/** Tappable AI suggestion chip. */
@Composable
fun AiChip(text: String, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(Radii.tag)
            .background(AppColors.Surface)
            .border(1.dp, AppColors.Indigo.copy(alpha = 0.25f), Radii.tag)
            .clickable { onClick() }
            .padding(horizontal = Space.m, vertical = Space.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.AutoAwesome, null, tint = AppColors.Indigo, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(Space.xs + Space.xxs))
        Text(text, style = AppType.metaStrong, color = AppColors.TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ── States ───────────────────────────────────────────────────────

@Composable
fun EmptyState(
    title: String,
    message: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.xxl, vertical = Space.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = AppType.rowTitle, color = AppColors.TextPrimary)
        Spacer(Modifier.height(Space.xs))
        Text(
            message,
            style = AppType.meta,
            color = AppColors.TextSecondary,
            modifier = Modifier.fillMaxWidth(),
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(Space.l))
            PrimaryButton(actionLabel, onClick = onAction)
        }
    }
}

@Composable
fun LoadingRows(count: Int = 5) {
    Column(Modifier.fillMaxWidth()) {
        repeat(count) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Space.gutter, vertical = Space.m),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(AppColors.SurfaceMuted))
                Spacer(Modifier.width(Space.m))
                Column(Modifier.weight(1f)) {
                    Box(Modifier.fillMaxWidth(0.45f).height(13.dp).clip(Radii.tag).background(AppColors.SurfaceMuted))
                    Spacer(Modifier.height(Space.s))
                    Box(Modifier.fillMaxWidth(0.7f).height(11.dp).clip(Radii.tag).background(AppColors.SurfaceSunken))
                }
            }
            HairLine()
        }
    }
}

@Composable
fun InlineNotice(text: String, tone: StatusTone = StatusTone(AppColors.Danger, AppColors.DangerSoft)) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(Radii.control)
            .background(tone.bg)
            .padding(horizontal = Space.m, vertical = Space.s + Space.xxs),
    ) {
        Text(text, style = AppType.meta, color = tone.fg)
    }
}

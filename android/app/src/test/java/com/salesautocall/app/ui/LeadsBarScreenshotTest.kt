package com.salesautocall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.salesautocall.app.ui.design.AppColors
import com.salesautocall.app.ui.design.CoachPulseButton
import com.salesautocall.app.ui.design.GlassIconButton
import com.salesautocall.app.ui.design.IosNavBar
import com.salesautocall.app.ui.design.IosSearchField
import com.salesautocall.app.ui.design.ScanChip
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The Leads top area exactly as TelecallerScreens builds it (same components,
 * same order), rendered at the two widths that matter, with a hard check that
 * the centred title never touches ☰ or •••, and that the search row fits.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LeadsBarScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun content(subtitle: String) {
        rule.setContent {
            Column(Modifier.fillMaxSize().background(AppColors.Canvas)) {
                IosNavBar(
                    title = "Leads", collapsed = true, subtitle = subtitle,
                    leading = {
                        Icon(Icons.Default.Menu, contentDescription = "Menu",
                            modifier = Modifier.size(44.dp).clip(CircleShape).padding(10.dp))
                    },
                    trailing = { GlassIconButton(Icons.Default.MoreHoriz, "More") {} },
                )
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    IosSearchField("", {}, Modifier.weight(1f),
                        placeholder = if (LocalConfiguration.current.screenWidthDp < 420) "Search" else "Search name or phone")
                    ScanChip(onClick = {})
                    CoachPulseButton(unread = true, onClick = {})
                    Icon(Icons.Default.Sort, contentDescription = "Filters", modifier = Modifier.size(44.dp).padding(12.dp))
                }
            }
        }
    }

    private fun Rect.hits(o: Rect) = left < o.right && o.left < right && top < o.bottom && o.top < bottom

    private fun checkNoOverlap() {
        val bounds = { t: String -> rule.onNodeWithText(t).getUnclippedBoundsInRoot().let { Rect(it.left.value, it.top.value, it.right.value, it.bottom.value) } }
        val desc = { d: String -> rule.onNodeWithContentDescription(d).getUnclippedBoundsInRoot().let { Rect(it.left.value, it.top.value, it.right.value, it.bottom.value) } }
        val title = bounds("Leads")
        val sub = rule.onNodeWithText("545 leads", substring = true).getUnclippedBoundsInRoot().let { Rect(it.left.value, it.top.value, it.right.value, it.bottom.value) }
        for (icon in listOf(desc("Menu"), desc("More"))) {
            assertFalse("title overlaps an icon", title.hits(icon))
            assertFalse("subtitle overlaps an icon", sub.hits(icon))
        }
        val search = desc("AI coach, new tip")
        assertFalse("coach overlaps filters", search.hits(desc("Filters")))
    }

    @Test @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    fun leadsBar360() {
        content("545 leads · ₹14.62 Cr"); checkNoOverlap()
        rule.onRoot().captureRoboImage("/workspace/build_leadsbar_360.png")
    }

    @Test @Config(qualifiers = "w390dp-h844dp-xxhdpi")
    fun leadsBar390() {
        content("545 leads · ₹14.62 Cr"); checkNoOverlap()
        rule.onRoot().captureRoboImage("/workspace/build_leadsbar_390.png")
    }

    /** A worst case: a much longer subtitle must ellipsize, never slide under •••. */
    @Test @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    fun longSubtitle360() {
        content("12,545 leads · ₹1,214.62 Cr on the table this month"); checkNoOverlap()
        rule.onRoot().captureRoboImage("/workspace/build_leadsbar_360_long.png")
    }
}

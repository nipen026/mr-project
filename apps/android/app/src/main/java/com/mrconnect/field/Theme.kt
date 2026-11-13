package com.mrconnect.field

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.rememberAsyncImagePainter
import coil.decode.SvgDecoder
import coil.imageLoader

val Brand = Color(0xFF0F766E)
val BrandStrong = Color(0xFF115E59)
val Navy = Color(0xFF0F2A33)
val Ink = Color(0xFF14232B)
val Muted = Color(0xFF4B5F69)
val Subtle = Color(0xFF66767F)
val Canvas = Color(0xFFF3F6F8)
val Soft = Color(0xFFE3F2F0)
val Line = Color(0xFFE1E8EC)
val LineStrong = Color(0xFFC3D0D6)
val OnNavy = Color(0xFFC9DCE1)
val Danger = Color(0xFFB42318)
val DangerBg = Color(0xFFFEE4E2)
val Ok = Color(0xFF157F3B)
val OkBg = Color(0xFFDCF5E3)
val Warn = Color(0xFF9A5B00)
val WarnBg = Color(0xFFFFF0CC)
val Orange = Color(0xFFB54708)
val OrangeBg = Color(0xFFFFEAD5)
val NeutralBg = Color(0xFFEAEFF3)
@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
val Manrope =
    FontFamily(
        *listOf(400, 500, 600, 700, 800)
            .map { weight ->
                Font(
                    R.font.manrope,
                    weight = FontWeight(weight),
                    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
                )
            }
            .toTypedArray()
    )

@Composable
fun FieldTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme =
            lightColorScheme(
                primary = Brand,
                onPrimary = Color.White,
                secondary = Brand,
                background = Canvas,
                surface = Color.White,
                onSurface = Ink,
                onBackground = Ink,
                outline = Line,
                error = Danger,
                onError = Color.White,
                surfaceVariant = Soft,
            ),
        typography =
            Typography(
                bodyLarge = TextStyle(fontFamily = Manrope, fontSize = 14.sp, lineHeight = 22.sp),
                bodyMedium = TextStyle(fontFamily = Manrope, fontSize = 12.sp, lineHeight = 18.sp),
                titleLarge =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 20.sp,
                        lineHeight = 28.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                titleMedium =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 16.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                headlineMedium =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                    ),
                labelLarge =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
            ),
        content = content,
    )
}

@Composable
fun FieldIcon(name: String, size: Int = 24) {
    val context = LocalContext.current
    val loader =
        androidx.compose.runtime.remember(context) {
            context.imageLoader.newBuilder().components { add(SvgDecoder.Factory()) }.build()
        }
    Image(
        painter = rememberAsyncImagePainter("file:///android_asset/icons/$name.svg", loader),
        contentDescription = null,
        modifier = Modifier.size(size.dp),
    )
}

/** Semantic colours for a record status, matching the admin workspace. */
private fun statusColors(status: String): Pair<Color, Color> =
    when (status) {
        "approved", "active", "acknowledged", "completed" -> OkBg to Ok
        "rejected" -> DangerBg to Danger
        "returned" -> OrangeBg to Orange
        "draft" -> NeutralBg to Color(0xFF344054)
        else -> WarnBg to Warn
    }

/** Rounded status pill with a leading dot, for lists and detail screens. */
@Composable
fun StatusBadge(status: String) {
    val (bg, fg) = statusColors(status)
    androidx.compose.material3.Surface(
        color = bg,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
    ) {
        androidx.compose.foundation.layout.Row(
            Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp),
        ) {
            androidx.compose.foundation.layout.Box(
                Modifier.size(6.dp)
                    .background(fg, androidx.compose.foundation.shape.CircleShape)
            )
            Text(
                status.replaceFirstChar { it.uppercase() },
                color = fg,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

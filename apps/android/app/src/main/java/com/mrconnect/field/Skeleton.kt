package com.mrconnect.field

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape

@Composable
private fun shimmer(): Brush {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val x by
        transition.animateFloat(
            initialValue = -400f,
            targetValue = 1200f,
            animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart),
            label = "skeleton-x",
        )
    return Brush.linearGradient(
        listOf(Color(0xFFE1E8EC), Color(0xFFF0F5F6), Color(0xFFE1E8EC)),
        start = Offset(x, 0f),
        end = Offset(x + 400f, 0f),
    )
}

@Composable
private fun Bar(brush: Brush, fraction: Float, height: Dp) {
    Box(
        Modifier.fillMaxWidth(fraction)
            .height(height)
            .clip(RoundedCornerShape(8.dp))
            .background(brush)
    )
}

/** Placeholder cards shown while a screen waits for its first data. */
@Composable
fun SkeletonCards(count: Int = 3) {
    val brush = shimmer()
    Column(
        Modifier.semantics { contentDescription = "Loading" },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        repeat(count) {
            FieldCard {
                Bar(brush, 0.45f, 14.dp)
                Bar(brush, 1f, 12.dp)
                Bar(brush, 0.7f, 12.dp)
            }
        }
    }
}

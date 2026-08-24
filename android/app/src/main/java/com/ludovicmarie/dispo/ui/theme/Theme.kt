package com.ludovicmarie.dispo.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val DispoPurple = Color(0xFF6D43E0)
val DispoViolet = Color(0xFF9D7BFF)
val DispoCoral = Color(0xFFFF6B6B)
val DispoGold = Color(0xFFFFC857)
val DispoInk = Color(0xFF17121F)
val DispoCream = Color(0xFFFFFBFF)

private val LightColors = lightColorScheme(
    primary = DispoPurple,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE9DDFF),
    onPrimaryContainer = Color(0xFF24104D),
    secondary = Color(0xFF715B00),
    secondaryContainer = Color(0xFFFFE178),
    onSecondaryContainer = Color(0xFF241A00),
    tertiary = DispoCoral,
    background = DispoCream,
    surface = DispoCream,
    surfaceVariant = Color(0xFFF0EBF4),
    onSurface = DispoInk,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFCDBDFF),
    onPrimary = Color(0xFF351577),
    primaryContainer = Color(0xFF4E2A9D),
    onPrimaryContainer = Color(0xFFE9DDFF),
    secondary = DispoGold,
    secondaryContainer = Color(0xFF564500),
    onSecondaryContainer = Color(0xFFFFE178),
    tertiary = Color(0xFFFFB3B1),
    background = Color(0xFF141118),
    surface = Color(0xFF141118),
    surfaceVariant = Color(0xFF302B35),
    onSurface = Color(0xFFECE6EF),
)

@Composable
fun DispoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // Deliberately use the Dispo palette instead of dynamic colors so the
    // identity remains consistent with the iOS app on every Android device.
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = DispoTypography,
        content = content,
    )
}

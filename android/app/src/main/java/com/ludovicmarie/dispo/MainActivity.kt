package com.ludovicmarie.dispo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.ludovicmarie.dispo.ui.DispoApp
import com.ludovicmarie.dispo.ui.theme.DispoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DispoTheme {
                DispoApp()
            }
        }
    }
}

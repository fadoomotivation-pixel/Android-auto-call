import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.google.services)
}

// Supabase config. Override in local.properties or CI; defaults to the
// public SalesAutoCall project (anon key is safe to embed — gated by RLS).
val supabaseUrl: String =
    (project.findProperty("SUPABASE_URL") as String?) ?: "https://rqgkzamuohdvttnkluzn.supabase.co"
val supabaseAnonKey: String =
    (project.findProperty("SUPABASE_ANON_KEY") as String?) ?: "sb_publishable_jbinu2H4JrpqAUp_3Prdpw_8pZzE58N"

// Release signing. Reads from keystore.properties (never committed). If the file
// is absent (e.g. CI without secrets), the release build falls back to unsigned
// and you sign later. See android/keystore.properties.example.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(keystorePropsFile.inputStream())
}
val hasReleaseSigning = keystorePropsFile.exists()

android {
    namespace = "com.salesautocall.app"
    compileSdk = 34

    defaultConfig {
        // Matches the Firebase-registered package (project callpro-b5aa1). The code
        // namespace stays com.salesautocall.app, so no source moves.
        applicationId = "com.callpro.ai"
        minSdk = 26
        targetSdk = 34
        // Version is monotonic from CI (the workflow passes the run number) so the
        // in-app updater can tell newer builds apart; local builds default to 1.
        versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("VERSION_NAME") ?: "0.1.0"

        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        // Default update channel; each brand flavor overrides it below.
        buildConfigField("String", "UPDATE_TAG", "\"android-latest\"")
    }

    // White-label brands. Every flavor keeps the SAME applicationId
    // (com.callpro.ai) so ONE google-services.json / Firebase project serves all
    // of them — no per-company Firebase setup. Flavors differ only by their app
    // NAME, icon/splash colour (@color/ic_launcher_background override in
    // src/<flavor>/res), and their self-update channel (UPDATE_TAG → its own
    // GitHub release). Adding a company = one flavor + one res folder, nothing
    // else. `standard` IS the current Call Pro AI app (unchanged).
    flavorDimensions += "brand"
    productFlavors {
        create("standard") {
            dimension = "brand"
            // Uses the base strings.xml ("Call Pro AI") + colors.xml, tag android-latest.
        }
        create("sndeveloper") {
            dimension = "brand"
            buildConfigField("String", "UPDATE_TAG", "\"android-sndeveloper\"")
        }
        create("manasproperty") {
            dimension = "brand"
            buildConfigField("String", "UPDATE_TAG", "\"android-manasproperty\"")
        }
    }

    signingConfigs {
        // Fixed debug keystore (debug creds are non-secret by design) so every CI
        // build shares one signature — required for in-app updates to install over
        // the previous version without an uninstall.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    // APK SIZE (Oct 2026): the published app-debug.apk was 168 MB, mostly
    // Linphone native libs for 4 ABIs plus ~90 MB of unshrunk dex. Phones
    // downloaded it slowly through the in-app updater.
    //  - ABIs: every Android phone our reps use is ARM. x86/x86_64 are emulator-
    //    only, so they're left out unless you build with -PincludeX86=true
    //    (local emulator work). CI never passes it, so releases are ARM only.
    //  - Dex: R8 SHRINKING only (no obfuscation, see proguard-rules.pro) on the
    //    debug build that is published. Build type and the committed debug.keystore
    //    are unchanged, so the signature is identical and updates still install
    //    over existing installs.
    val includeX86 = (project.findProperty("includeX86") as String?) == "true"

    buildTypes {
        debug {
            ndk {
                abiFilters.clear()
                abiFilters += listOf("arm64-v8a", "armeabi-v7a")
                if (includeX86) abiFilters += listOf("x86", "x86_64")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        // Store the ARM .so files compressed in the APK (legacy packaging). The
        // download shrinks by tens of MB; Android extracts them once at install.
        jniLibs {
            useLegacyPackaging = true
        }
    }
    androidResources {
        // Linphone ships 7 optional ringtones we never select (the app sets no
        // ring file, so Linphone uses its defaults: notes_of_the_optimistic.mkv,
        // ringback.wav, dont_wait_too_long.mkv hold music, silence.mkv). Those
        // defaults and every other sound/grammar/cert stay. First part of this
        // pattern is AAPT's default ignore list, kept as-is.
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~" +
            ":!four_hands_together.mkv:!house_keeping.mkv:!its_a_game.mkv:!leaving_dreams.mkv" +
            ":!soft_as_snow.mkv:!oldphone-mono.wav:!toy-mono.wav"
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.core.splashscreen)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    // Remote images (company logo on the branded home hero).
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Scan list: on-device text recognition, bundled Latin model (offline,
    // nothing uploaded). Free feature, see ui/ScanListScreen.kt.
    implementation("com.google.mlkit:text-recognition:16.0.1")

    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.functions)
    // Voice-note audio lives in Supabase Storage (private bucket).
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation(libs.ktor.client.android)

    // Native SIP/VoIP engine (registers over SIP-UDP like Zoiper, handles audio).
    implementation("org.linphone:linphone-sdk-android:5.3.+")

    // Media3/ExoPlayer for recording playback
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)

    // WorkManager
    implementation(libs.androidx.work.runtime.ktx)

    // Firebase Cloud Messaging — instant push for new hot leads.
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging")

    // Plain JVM tests for pure calculations (My report numbers).
    testImplementation("junit:junit:4.13.2")
}

# Keep Kotlinx Serialization metadata
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class com.salesautocall.app.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ---- Size build (shrink only, behaviour-safe) ----
# No renaming: stack traces stay readable and nothing that looks a class up by
# name (JNI, ServiceLoader, reflection, kotlinx serialization) can break.
-dontobfuscate
# Debug build stays debuggable; keep line numbers.
-keepattributes SourceFile,LineNumberTable,Signature,Exceptions,EnclosingMethod,*Annotation*,InnerClasses
# Our own code: keep everything (manifest components, reflection, serializers).
-keep class com.salesautocall.app.** { *; }
# Linphone: native code calls back into Java classes/methods by name via JNI.
-keep class org.linphone.** { *; }
-keep interface org.linphone.** { *; }
# Supabase / ktor / kotlinx serialization: serializers + ServiceLoader engines.
-keep class io.github.jan.supabase.** { *; }
-keep class io.ktor.** { *; }
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class ** { *** Companion; }
-keepclasseswithmembers class ** { kotlinx.serialization.KSerializer serializer(...); }
-keep class kotlinx.coroutines.** { *; }
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
-dontwarn org.linphone.**
-dontwarn java.lang.management.**
-dontwarn javax.**

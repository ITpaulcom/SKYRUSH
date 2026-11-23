# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---- Sky Duell: R8 sicher fuer Capacitor ----
# Annotationen/Signaturen behalten (Capacitor liest Plugin-Annotationen per Reflection)
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor-Kern + Bridge (WebView <-> nativ)
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# Unsere App-Klassen (MainActivity)
-keep class com.itpaul.skyrush.** { *; }

# Plugins: Namen muessen exakt bleiben, die JS-Seite ruft sie per Name auf
-keep class com.getcapacitor.community.admob.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.revenuecat.purchases.capacitor.** { *; }
-keep class com.revenuecat.purchases.hybridcommon.** { *; }

# Kotlin-Metadaten (fuer Kotlin-Plugins)
-keep class kotlin.Metadata { *; }
-dontwarn org.apache.cordova.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**

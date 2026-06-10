pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Linphone SDK (native SIP/VoIP engine) is published here, not on Maven Central.
        maven { url = uri("https://download.linphone.org/maven_repository") }
    }
}

rootProject.name = "SalesAutoCall"
include(":app")

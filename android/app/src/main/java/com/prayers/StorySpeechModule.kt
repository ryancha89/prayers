package com.prayers

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Speech-to-text for the story player — the Android twin of ios/prayers/StorySpeech.m, same
 * contract: start(lang) → Promise<boolean>, stop(), events StorySpeechResult {text, final} and
 * StorySpeechEnd {error?}. RECORD_AUDIO is asked for by JS (PermissionsAndroid) before start.
 * SpeechRecognizer must live on the main thread.
 */
class StorySpeechModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var last = ""

  override fun getName() = "StorySpeech"

  private fun emit(name: String, text: String? = null, final: Boolean = false, error: String? = null) {
    val body = Arguments.createMap()
    if (text != null) {
      body.putString("text", text)
      body.putBoolean("final", final)
    }
    if (error != null) body.putString("error", error)
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, body)
  }

  private fun tagFor(lang: String) = when (lang) {
    "en" -> "en-US"; "ja" -> "ja-JP"; "zh-CN" -> "zh-CN"; "zh-TW" -> "zh-TW"; "vi" -> "vi-VN"
    else -> "ko-KR"
  }

  @ReactMethod
  fun start(lang: String, promise: Promise) {
    main.post {
      if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
        promise.resolve(false); return@post
      }
      teardown()
      last = ""
      val r = SpeechRecognizer.createSpeechRecognizer(ctx)
      r.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
        override fun onPartialResults(partial: Bundle?) {
          val t = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
          last = t
          emit("StorySpeechResult", t, false)
        }
        override fun onResults(results: Bundle?) {
          val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: last
          emit("StorySpeechResult", t, true)
          emit("StorySpeechEnd")
          teardown()
        }
        override fun onError(error: Int) {
          // "no match" after a final partial still counts as what was heard
          if (last.isNotEmpty()) emit("StorySpeechResult", last, true)
          emit("StorySpeechEnd", error = "code $error")
          teardown()
        }
      })
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, tagFor(lang))
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      }
      recognizer = r
      r.startListening(intent)
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun stop() {
    main.post { recognizer?.stopListening() }
  }

  // Required by NativeEventEmitter on Android.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  private fun teardown() {
    recognizer?.destroy()
    recognizer = null
  }

  override fun invalidate() {
    main.post { teardown() }
    super.invalidate()
  }
}

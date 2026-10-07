package io.github.redrabbitdevs.remo;

import android.content.Context;
import android.net.DhcpInfo;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Native networking for Remo on Android.
 *
 * The WebView cannot talk to Daikin adapters directly (no CORS, self-signed TLS on BRP072C,
 * UDP discovery), so the web UI calls this plugin instead:
 *   request({method, url, headers, body, insecureTls, timeoutMs}) -> {status, body, headers}
 *   discover({timeoutMs}) -> {devices: [{ip, info}]}
 *
 * Only private LAN addresses and the Daikin cloud hosts can be reached, and certificate checks
 * are relaxed only for private LAN addresses.
 */
@CapacitorPlugin(name = "DaikinNet")
public class DaikinNetPlugin extends Plugin {

    private static final int DISCOVERY_PORT = 30050;
    private static final String DISCOVERY_MSG = "DAIKIN_UDP/common/basic_info";
    private static final int MAX_BODY = 2 * 1024 * 1024;
    private static final Set<String> CLOUD_HOSTS = new HashSet<>(Arrays.asList(
            "proddit.ditdeneb.com",
            "proddit-energy.ditdeneb.com",
            "scr.dspsph.com",
            "sha2.daikinonlinecontroller.com",
            "daikinsmartdb.jp"));
    private static final Pattern PRIVATE = Pattern.compile(
            "^(10\\.\\d+\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+|169\\.254\\.\\d+\\.\\d+|"
                    + "100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d+\\.\\d+|[a-zA-Z0-9-]+|[a-zA-Z0-9-]+\\.local)$");

    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private SSLSocketFactory lanSocketFactory;

    static boolean isPrivateHost(String host) {
        if (host == null || host.isEmpty() || host.startsWith("127.") || host.equalsIgnoreCase("localhost")) return false;
        return PRIVATE.matcher(host).matches();
    }

    static boolean isAllowed(URL url) {
        String proto = url.getProtocol();
        if (!"http".equals(proto) && !"https".equals(proto)) return false;
        if (CLOUD_HOSTS.contains(url.getHost())) return "https".equals(proto);
        return isPrivateHost(url.getHost());
    }

    @PluginMethod
    public void request(final PluginCall call) {
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(call.getString("url", ""));
                if (!isAllowed(url)) {
                    call.reject("Target not allowed: " + url, "forbidden");
                    return;
                }
                int timeout = call.getInt("timeoutMs", 8000);
                conn = (HttpURLConnection) url.openConnection();
                if (conn instanceof HttpsURLConnection && isPrivateHost(url.getHost())) {
                    HttpsURLConnection https = (HttpsURLConnection) conn;
                    https.setSSLSocketFactory(lanFactory());
                    https.setHostnameVerifier((h, s) -> true);
                }
                conn.setConnectTimeout(timeout);
                conn.setReadTimeout(timeout);
                conn.setInstanceFollowRedirects(false);
                conn.setUseCaches(false);
                conn.setRequestMethod(call.getString("method", "GET"));
                JSObject headers = call.getObject("headers", new JSObject());
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    conn.setRequestProperty(k, headers.getString(k));
                }
                String body = call.getString("body");
                if (body != null) {
                    conn.setDoOutput(true);
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(bytes);
                    }
                }
                int status = conn.getResponseCode();
                InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                String text = is == null ? "" : readAll(is);
                JSObject resHeaders = new JSObject();
                for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                    if (e.getKey() != null) resHeaders.put(e.getKey().toLowerCase(), String.join(", ", e.getValue()));
                }
                JSObject ret = new JSObject();
                ret.put("status", status);
                ret.put("body", text);
                ret.put("headers", resHeaders);
                call.resolve(ret);
            } catch (SocketTimeoutException e) {
                call.reject("Request timed out", "timeout");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.toString() : e.getMessage(), "network");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void discover(final PluginCall call) {
        final int timeout = Math.max(500, Math.min(call.getInt("timeoutMs", 3000), 10000));
        executor.execute(() -> {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock lock = null;
            Map<String, JSObject> found = new LinkedHashMap<>();
            try (DatagramSocket socket = new DatagramSocket()) {
                if (wifi != null) {
                    lock = wifi.createMulticastLock("remo-discovery");
                    lock.setReferenceCounted(false);
                    lock.acquire();
                }
                socket.setBroadcast(true);
                byte[] msg = DISCOVERY_MSG.getBytes(StandardCharsets.US_ASCII);
                Set<InetAddress> targets = new HashSet<>();
                targets.add(InetAddress.getByName("255.255.255.255"));
                InetAddress subnet = wifiBroadcast(wifi);
                if (subnet != null) targets.add(subnet);
                for (InetAddress t : targets) socket.send(new DatagramPacket(msg, msg.length, t, DISCOVERY_PORT));
                long end = System.currentTimeMillis() + timeout;
                byte[] buf = new byte[2048];
                while (System.currentTimeMillis() < end) {
                    socket.setSoTimeout((int) Math.max(1, end - System.currentTimeMillis()));
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try {
                        socket.receive(p);
                    } catch (SocketTimeoutException e) {
                        break;
                    }
                    String text = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                    JSObject info = new JSObject();
                    for (String part : text.trim().split(",")) {
                        int i = part.indexOf('=');
                        if (i > 0) info.put(part.substring(0, i), part.substring(i + 1));
                    }
                    if (!"OK".equals(info.optString("ret")) && !info.has("mac")) continue;
                    String ip = p.getAddress().getHostAddress();
                    JSObject dev = new JSObject();
                    dev.put("ip", ip);
                    dev.put("info", info);
                    found.put(info.optString("mac", ip), dev);
                }
                JSArray arr = new JSArray();
                for (JSObject d : found.values()) arr.put(d);
                JSObject ret = new JSObject();
                ret.put("devices", arr);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Discovery failed: " + e.getMessage(), "network");
            } finally {
                if (lock != null && lock.isHeld()) lock.release();
            }
        });
    }

    private static InetAddress wifiBroadcast(WifiManager wifi) {
        try {
            if (wifi == null) return null;
            @SuppressWarnings("deprecation")
            DhcpInfo dhcp = wifi.getDhcpInfo();
            if (dhcp == null || dhcp.ipAddress == 0) return null;
            int broadcast = (dhcp.ipAddress & dhcp.netmask) | ~dhcp.netmask;
            byte[] quads = new byte[4];
            for (int k = 0; k < 4; k++) quads[k] = (byte) ((broadcast >> k * 8) & 0xFF);
            return InetAddress.getByAddress(quads);
        } catch (IOException e) {
            return null;
        }
    }

    private static String readAll(InputStream is) throws IOException {
        try (InputStream in = is; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                if (out.size() > MAX_BODY) throw new IOException("Response too large");
            }
            return out.toString("UTF-8");
        }
    }

    /** TLS factory for LAN adapters: accepts their self-signed certificate and old protocol versions. */
    private synchronized SSLSocketFactory lanFactory() throws Exception {
        if (lanSocketFactory != null) return lanSocketFactory;
        TrustManager[] trustAll = new TrustManager[] {
            new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
                @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }
        };
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, trustAll, new SecureRandom());
        final SSLSocketFactory base = ctx.getSocketFactory();
        lanSocketFactory = new SSLSocketFactory() {
            private Socket widen(Socket s) {
                if (s instanceof SSLSocket) {
                    SSLSocket ssl = (SSLSocket) s;
                    ssl.setEnabledProtocols(ssl.getSupportedProtocols());
                    ssl.setEnabledCipherSuites(ssl.getSupportedCipherSuites());
                }
                return s;
            }
            @Override public String[] getDefaultCipherSuites() { return base.getDefaultCipherSuites(); }
            @Override public String[] getSupportedCipherSuites() { return base.getSupportedCipherSuites(); }
            @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose) throws IOException { return widen(base.createSocket(s, host, port, autoClose)); }
            @Override public Socket createSocket(String host, int port) throws IOException { return widen(base.createSocket(host, port)); }
            @Override public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException { return widen(base.createSocket(host, port, localHost, localPort)); }
            @Override public Socket createSocket(InetAddress host, int port) throws IOException { return widen(base.createSocket(host, port)); }
            @Override public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException { return widen(base.createSocket(address, port, localAddress, localPort)); }
        };
        return lanSocketFactory;
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}

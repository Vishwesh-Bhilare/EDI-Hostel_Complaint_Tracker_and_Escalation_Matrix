import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Enumeration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Entry point. Opens a plain TCP server socket and speaks HTTP over it by
 * hand (see RequestHandler) — no Spring, no servlet container, no REST
 * framework of any kind.
 *
 * Run with: java TcpServer [port]   (defaults to 8080)
 */
public class TcpServer {

    private static final int DEFAULT_PORT = 8080;

    public static void main(String[] args) throws IOException {
        int port = DEFAULT_PORT;

        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("Invalid port: " + args[0]);
                System.exit(1);
                return;
            }
        }

        ExecutorService executor = Executors.newCachedThreadPool();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            executor.shutdown();
        }));

        try (ServerSocket serverSocket = new ServerSocket()) {
            serverSocket.setReuseAddress(true);
            serverSocket.bind(new InetSocketAddress(port));

            System.out.println("HostelCare server listening on port " + port);
            System.out.println("Open on this machine : http://localhost:" + port + "/");
            System.out.println("Open from LAN device : http://" + getLanIp() + ":" + port + "/");

            try {
                while (true) {
                    Socket clientSocket = serverSocket.accept();
                    executor.submit(new RequestHandler(clientSocket));
                }
            } catch (IOException e) {
                if (!serverSocket.isClosed()) {
                    System.err.println(e.getMessage());
                }
            }
        }
    }

    private static String getLanIp() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();

                if (networkInterface.isLoopback() || !networkInterface.isUp()) {
                    continue;
                }

                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();

                    if (address.isLoopbackAddress() || !(address instanceof Inet4Address)) {
                        continue;
                    }

                    return address.getHostAddress();
                }
            }
        } catch (Exception e) {
            return "<unknown>";
        }

        return "<unknown>";
    }
}

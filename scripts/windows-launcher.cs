// Development portable-package launcher. No shell or PowerShell execution
// policy change is needed. Arguments are encoded using Windows CRT rules.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class PublyLauncher {
  private static string Quote(string value) {
    var result = new StringBuilder("\"");
    int backslashes = 0;
    foreach (char c in value) {
      if (c == '\\') { backslashes++; continue; }
      if (c == '"') {
        result.Append('\\', backslashes * 2 + 1);
        result.Append('"');
      } else {
        result.Append('\\', backslashes);
        result.Append(c);
      }
      backslashes = 0;
    }
    result.Append('\\', backslashes * 2);
    return result.Append('"').ToString();
  }

  private static int Main(string[] args) {
    try {
      string directory = AppDomain.CurrentDomain.BaseDirectory;
      string node = Path.Combine(directory, "runtime", "node.exe");
      string cli = Path.Combine(directory, "app", "dist", "index.js");
      var arguments = new StringBuilder(Quote(cli));
      foreach (string argument in args) arguments.Append(' ').Append(Quote(argument));
      var options = new ProcessStartInfo(node, arguments.ToString());
      options.UseShellExecute = false;
      using (Process child = Process.Start(options)) {
        child.WaitForExit();
        return child.ExitCode;
      }
    } catch (Exception error) {
      Console.Error.WriteLine("Unable to start Publy: " + error.Message);
      return 1;
    }
  }
}

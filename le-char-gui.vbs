' Starts the le-char GUI without a console window. The server opens an app
' window and exits on its own once that window is closed.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

If shell.Run("cmd /c where node", 0, True) <> 0 Then
  MsgBox "Node.js was not found. Install Node 22 or newer from https://nodejs.org and try again.", vbExclamation, "LE Character Maker"
  WScript.Quit 1
End If

shell.CurrentDirectory = root
shell.Run "node """ & root & "\src\server.js"" --open", 0, False

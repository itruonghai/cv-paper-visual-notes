import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("skill_install", ROOT / "install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def destination(self, host):
        return self.root / host / "skills" / installer.NAME

    def test_both_hosts_share_resources_and_receive_correct_entrypoints(self):
        codex, _ = installer.install("codex", self.destination("codex"))
        claude, _ = installer.install("claude", self.destination("claude"))
        self.assertEqual((codex / "SKILL.md").read_bytes(), (installer.SOURCE / "SKILL.md").read_bytes())
        self.assertTrue((codex / "agents/openai.yaml").is_file())
        self.assertFalse((claude / "agents").exists())
        text = (claude / "SKILL.md").read_text()
        self.assertIn("${CLAUDE_SKILL_DIR}", text)
        self.assertIn("argument-hint:", text)
        self.assertNotIn("allowed-tools:", text)
        for folder in ("scripts", "references", "assets"):
            for source in (installer.SOURCE / folder).rglob("*"):
                if source.is_file() and "__pycache__" not in source.parts:
                    relative = source.relative_to(installer.SOURCE)
                    self.assertEqual((codex / relative).read_bytes(), (claude / relative).read_bytes())

    def test_existing_installation_is_unchanged_without_update(self):
        dest, _ = installer.install("codex", self.destination("codex"))
        marker = dest / "local-customization.txt"
        marker.write_text("Keep this custom work.")
        with self.assertRaisesRegex(ValueError, "already exists"):
            installer.install("codex", dest)
        self.assertEqual(marker.read_text(), "Keep this custom work.")

    def test_update_retains_config_and_backs_up_custom_files_outside_discovery(self):
        dest, _ = installer.install("claude", self.destination("claude"))
        config = b'{"library_root":"/example/my-papers"}\n'
        (dest / "runtime.local.json").write_bytes(config)
        (dest / "local-customization.txt").write_text("My previous edits")
        (dest / "SKILL.md").write_text("An older local skill")
        updated, backup = installer.install("claude", dest, update=True)
        self.assertIsNotNone(backup)
        self.assertFalse(backup.is_relative_to(dest.parent))
        self.assertEqual((updated / "runtime.local.json").read_bytes(), config)
        self.assertEqual((backup / "local-customization.txt").read_text(), "My previous edits")
        self.assertEqual((backup / "SKILL.md").read_text(), "An older local skill")
        self.assertIn("argument-hint:", (updated / "SKILL.md").read_text())

    def test_cannot_install_over_source(self):
        before = (installer.SOURCE / "SKILL.md").read_bytes()
        with self.assertRaisesRegex(ValueError, "overlap"):
            installer.install("codex", installer.SOURCE, update=True)
        self.assertEqual((installer.SOURCE / "SKILL.md").read_bytes(), before)

    def test_wrong_destination_name_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "ending in"):
            installer.install("codex", self.root / "skills", update=True)
        self.assertFalse((self.root / "skills").exists())


if __name__ == "__main__":
    unittest.main()

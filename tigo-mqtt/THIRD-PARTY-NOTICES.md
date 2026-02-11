# Third-Party Notices

The `tigo-mqtt/` service incorporates the following third-party components,
which are downloaded and built into the Docker image at build time. No
third-party source code is checked into this repository — the Dockerfile
fetches these components from their upstream repositories.

In the event that a required notice is missing or incorrect, please
[open an issue](https://github.com/iscofield/realtime-tigo-monitor/issues).

---

## taptap

- **Description:** An implementation of the Tigo TAP protocol for monitoring
  Tigo solar optimizers via CCA devices
- **Source:** https://github.com/willglynn/taptap
- **Version:** v0.2.6 (pinned in Dockerfile)
- **License:** MIT
- **Copyright:** Copyright (c) 2024 Will Glynn

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## taptap-mqtt

- **Description:** Python service bridging taptap output to Home Assistant
  via MQTT, providing local access to Tigo solar installation data
- **Source:** https://github.com/litinoveweedle/taptap-mqtt
- **Version:** Pinned to commit `c656d6b` in Dockerfile
- **License:** GPL-3.0
- **Copyright:** Copyright (c) litinoveweedle

The taptap-mqtt source code is licensed under the GNU General Public License
v3.0. The full license text is available at:
https://www.gnu.org/licenses/gpl-3.0.html

A copy of the GPL-3.0 license is included in the taptap-mqtt source archive
that is downloaded during the Docker build, and is present in the built Docker
image at `/app/LICENSE`.

The taptap-mqtt source code is not distributed as part of this repository. It
is fetched from its upstream GitHub repository during `docker build`. The
corresponding source is available at the URL listed above.

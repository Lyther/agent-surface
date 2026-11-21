The order export in this repository (`/app`) shows an empty trailing page when the number of rows is an exact multiple of the page size. Support reported that a 40-row export with 20 rows per page lists three pages, and the last one is blank.

Fix the bug and add a regression test for it. Keep the change small and run the test suite before you finish.

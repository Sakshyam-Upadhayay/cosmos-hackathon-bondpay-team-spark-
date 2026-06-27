document.addEventListener("DOMContentLoaded", () => {
    // Navigation elements
    const sidebarLinks = document.querySelectorAll(".nav-links li");
    const mobileNavItems = document.querySelectorAll(".mobile-nav-item");
    const views = document.querySelectorAll(".view");

    // Sync navigation active states
    function switchView(targetId) {
        // Update Sidebar Links
        sidebarLinks.forEach(link => {
            if (link.getAttribute("data-target") === targetId) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });

        // Update Mobile Nav Items
        mobileNavItems.forEach(item => {
            if (item.getAttribute("data-target") === targetId) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Toggle Views
        views.forEach(v => {
            if (v.id === targetId) {
                v.classList.add("active-view");
            } else {
                v.classList.remove("active-view");
            }
        });

        // Trigger specific view loads
        if (targetId === "dashboard") fetchDashboardData();
        if (targetId === "cards") fetchCards();
        if (targetId === "transactions") fetchTransactions();
    }

    // Attach click events for Sidebar
    sidebarLinks.forEach(link => {
        link.addEventListener("click", () => {
            switchView(link.getAttribute("data-target"));
        });
    });

    // Attach click events for Mobile bottom bar
    mobileNavItems.forEach(item => {
        item.addEventListener("click", () => {
            switchView(item.getAttribute("data-target"));
        });
    });

    // Initial Dashboard Load
    fetchDashboardData();
    // Periodically poll stats in background (every 4 seconds) to keep UI fresh
    setInterval(fetchDashboardData, 4000);

    // Payment Logic
    const btnPayment = document.getElementById("btn-start-payment");
    const btnCancelPayment = document.getElementById("btn-cancel-payment");
    const paymentIdle = document.getElementById("payment-idle");
    const paymentActive = document.getElementById("payment-active");
    const activeAmountLabel = document.getElementById("active-payment-amount");
    const paymentStatus = document.getElementById("payment-status");
    const paymentInput = document.getElementById("payment-amount");

    let paymentPollInterval = null;
    let startTxCount = 0;

    btnPayment.addEventListener("click", () => {
        const amount = paymentInput.value;
        if (!amount || amount <= 0) {
            alert("Please enter a valid payment amount.");
            return;
        }

        btnPayment.disabled = true;
        btnPayment.textContent = "Connecting...";

        // Fetch current transaction count first
        fetch('/api/system')
            .then(res => res.json())
            .then(systemData => {
                startTxCount = systemData.totalTransactions;
                
                // Start payment on hardware
                return fetch('/api/payment/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: parseInt(amount) })
                });
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Update UI state
                    activeAmountLabel.textContent = `NPR ${parseInt(amount)}`;
                    paymentStatus.textContent = "Please hold your BondPay card close to the RFID reader.";
                    paymentStatus.style.color = "var(--accent-color)";
                    
                    paymentIdle.classList.add("hidden");
                    paymentActive.classList.remove("hidden");

                    // Start polling for card scan event
                    startPaymentPolling(amount);
                } else {
                    alert("Failed to start terminal payment.");
                    resetPaymentUI();
                }
            })
            .catch(err => {
                console.error(err);
                alert("Network communication error.");
                resetPaymentUI();
            });
    });

    btnCancelPayment.addEventListener("click", () => {
        resetPaymentUI();
    });

    function resetPaymentUI() {
        if (paymentPollInterval) {
            clearInterval(paymentPollInterval);
            paymentPollInterval = null;
        }
        btnPayment.disabled = false;
        btnPayment.textContent = "Start Payment";
        paymentInput.value = "";
        
        paymentActive.classList.add("hidden");
        paymentIdle.classList.remove("hidden");
    }

    function startPaymentPolling(amount) {
        if (paymentPollInterval) clearInterval(paymentPollInterval);
        
        // Clear any leftover scan on the server first
        fetch('/api/last-scan').then(() => {
            paymentPollInterval = setInterval(() => {
                fetch('/api/last-scan')
                    .then(res => res.json())
                    .then(scanData => {
                        // If a card UID is returned, it means a card was tapped!
                        if (scanData.uid && scanData.uid !== "") {
                            clearInterval(paymentPollInterval);
                            paymentPollInterval = null;
                            paymentStatus.textContent = `Card detected (${scanData.uid}). Processing payment...`;
                            paymentStatus.style.color = "var(--text-primary)";

                            // Wait 1.2 seconds for transaction files to save, then verify outcome
                            setTimeout(() => {
                                verifyPaymentOutcome();
                            }, 1200);
                        }
                    })
                    .catch(err => console.log("Error polling last scan:", err));
            }, 800);
        });
    }

    function verifyPaymentOutcome() {
        fetch('/api/system')
            .then(res => res.json())
            .then(data => {
                // Update stats
                document.getElementById("total-balance").textContent = "NPR " + data.totalBalance;
                document.getElementById("total-cards").textContent = data.totalCards;
                document.getElementById("total-tx").textContent = data.totalTransactions;

                if (data.totalTransactions > startTxCount) {
                    // Success!
                    paymentStatus.textContent = "Payment Completed Successfully! ✔";
                    paymentStatus.style.color = "var(--success)";
                } else {
                    // Fail (Insufficient balance or unregistered)
                    paymentStatus.textContent = "Payment Failed: Unregistered Card or Insufficient Balance ✖";
                    paymentStatus.style.color = "var(--danger)";
                }

                // Revert to idle after 3 seconds
                setTimeout(() => {
                    resetPaymentUI();
                }, 3000);
            })
            .catch(err => {
                console.log("Error verifying payment stats:", err);
                resetPaymentUI();
            });
    }

    // Modal logic for Registering New Card
    const modal = document.getElementById("card-modal");
    const btnNewCard = document.getElementById("btn-new-card");
    const closeBtn = document.querySelector(".close-btn");
    const btnFetchScan = document.getElementById("btn-fetch-scan");
    const newUidInput = document.getElementById("new-uid");

    btnNewCard.onclick = () => {
        modal.style.display = "block";
    };
    
    closeBtn.onclick = () => {
        modal.style.display = "none";
        stopScanPolling();
    };
    
    window.onclick = (e) => {
        if (e.target == modal) {
            modal.style.display = "none";
            stopScanPolling();
        }
    };

    // Auto-scan polling logic
    let scanPollInterval = null;

    btnFetchScan.addEventListener("click", () => {
        btnFetchScan.disabled = true;
        const origText = btnFetchScan.querySelector("span").textContent;
        btnFetchScan.querySelector("span").textContent = "Tap Card...";
        newUidInput.placeholder = "Please tap card on hardware reader...";
        newUidInput.value = "";

        // Flush any old scan
        fetch('/api/last-scan').then(() => {
            let attempts = 0;
            scanPollInterval = setInterval(() => {
                attempts++;
                if (attempts > 20) { // Timeout after 10 seconds (20 * 500ms)
                    stopScanPolling();
                    newUidInput.placeholder = "Tap card or enter UID";
                    alert("Card scan timeout. Please try again.");
                    return;
                }

                fetch('/api/last-scan')
                    .then(res => res.json())
                    .then(data => {
                        if (data.uid && data.uid !== "") {
                            newUidInput.value = data.uid;
                            stopScanPolling();
                            newUidInput.placeholder = "Tap card or enter UID";
                        }
                    })
                    .catch(err => console.log("Scan poll error:", err));
            }, 500);
        });
    });

    function stopScanPolling() {
        if (scanPollInterval) {
            clearInterval(scanPollInterval);
            scanPollInterval = null;
        }
        btnFetchScan.disabled = false;
        btnFetchScan.querySelector("span").textContent = "Scan";
    }

    // Register Card Form Submit
    const btnSaveCard = document.getElementById("btn-save-card");
    btnSaveCard.addEventListener("click", () => {
        const uid = newUidInput.value.trim().toUpperCase();
        const name = document.getElementById("new-name").value.trim();
        const balance = document.getElementById("new-balance").value;

        if (!uid || !name || !balance) {
            alert("Please fill in all registration fields.");
            return;
        }

        fetch('/api/cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, name, balance: parseInt(balance) })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                modal.style.display = "none";
                newUidInput.value = "";
                document.getElementById("new-name").value = "";
                document.getElementById("new-balance").value = "";
                fetchCards();
                fetchDashboardData();
            } else {
                alert(data.error || "Failed to register card.");
            }
        })
        .catch(err => alert("Error saving card."));
    });

    // Factory Reset button
    const btnReset = document.getElementById("btn-factory-reset");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            if (confirm("WARNING: Are you absolutely sure you want to perform a factory reset? This will erase all card data and transaction logs from the terminal LittleFS storage!")) {
                // Actually, we don't have a specific factory reset endpoint, let's trigger it or display feedback.
                // Wait! Since there is no factory reset API in WebServer.h, let's keep it as visual/mock or we could handle it if needed.
                // The original code had a button for factory reset but it was not wired. We can wire it if there is an endpoint, 
                // but since the original didn't implement it, we can just show that it's not supported in local cpanel offline sync mode or mock it.
                alert("Factory reset is restricted on this firmware. Please re-flash the hardware to clear data manually.");
            }
        });
    }
});

// API Fetch Functions
function fetchDashboardData() {
    fetch('/api/system')
        .then(res => res.json())
        .then(data => {
            document.getElementById("total-balance").textContent = "NPR " + data.totalBalance;
            document.getElementById("total-cards").textContent = data.totalCards;
            document.getElementById("total-tx").textContent = data.totalTransactions;
        })
        .catch(err => console.log("System Stats Fetch Error"));
}

function fetchCards() {
    fetch('/api/cards')
        .then(res => res.json())
        .then(data => {
            const tbody = document.querySelector("#cards-table tbody");
            tbody.innerHTML = "";
            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary)">No cards registered.</td></tr>`;
                return;
            }
            data.forEach(card => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="font-code">${card.uid}</td>
                    <td>${card.name}</td>
                    <td style="font-weight: 600;">NPR ${card.balance}</td>
                    <td>
                        <button class="btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" onclick="deleteCard('${card.uid}')">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => console.log("Cards Fetch Error"));
}

function fetchTransactions() {
    fetch('/api/transactions')
        .then(res => res.json())
        .then(data => {
            const tbody = document.querySelector("#transactions-table tbody");
            tbody.innerHTML = "";
            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary)">No transaction history found.</td></tr>`;
                return;
            }
            // Show latest transaction at the top
            data.reverse().forEach(tx => {
                const tr = document.createElement("tr");
                const shortId = tx.id && tx.id.length > 5 ? tx.id.slice(-5) : tx.id;
                tr.innerHTML = `
                    <td class="font-code">TX-${shortId}</td>
                    <td class="font-code">${tx.uid}</td>
                    <td>${tx.name}</td>
                    <td style="color: #ef4444; font-weight: 700;">- NPR ${tx.amount}</td>
                    <td style="color: var(--success); font-weight: 600;">NPR ${tx.new_balance}</td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => console.log("Tx Fetch Error"));
}

function deleteCard(uid) {
    if (!confirm(`Are you sure you want to delete card ${uid}? This action cannot be undone.`)) return;
    
    fetch(`/api/cards?uid=${uid}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                fetchCards();
                fetchDashboardData();
            } else {
                alert(data.error || "Failed to delete card.");
            }
        })
        .catch(err => alert("Error deleting card."));
}

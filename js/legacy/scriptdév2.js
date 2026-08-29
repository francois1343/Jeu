function rollDice() {
  const faces = parseInt(document.getElementById("faces").value);
  const dice = document.getElementById("dice");

  if (faces < 2) {
    alert("Le dé doit avoir au moins 2 faces.");
    return;
  }

  dice.textContent = "...";
  dice.classList.add("rolling");

  setTimeout(() => {
    const result = Math.floor(Math.random() * faces) + 1;
    dice.textContent = result;
    dice.classList.remove("rolling");
  }, 400);
}

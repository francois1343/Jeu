function randomChoice(choices) {
  const index = Math.floor(Math.random() * choices.length);
  return choices[index];
}

// Pile ou face
randomChoice(["Pile", "Face"]);

// Dé à 3 faces
randomChoice([1, 2, 3]);
